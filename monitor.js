require('dotenv').config();
const cron = require('node-cron');
const fs   = require('fs');
const path = require('path');

// ─── Dependências CSV ─────────────────────────────────────────────────────────
let csvParse, csvStringify;
try {
  csvParse     = require('csv-parse/sync').parse;
  csvStringify = require('csv-stringify/sync').stringify;
} catch {
  console.error('❌ Execute: npm install csv-parse csv-stringify');
  process.exit(1);
}

const { scrapeProduct, closeBrowser } = require('./scraper/productScraper');
const { getSitemapUrls, sleep, getFormattedDate } = require('./utils');

// ─── Configuração ─────────────────────────────────────────────────────────────
const SITEMAP_URL    = process.env.SITEMAP_URL;
const BATCH_SIZE     = parseInt(process.env.BATCH_SIZE    || '8');
const MONITOR_CRON   = process.env.MONITOR_CRON           || '0 */2 * * *';
const STOCK_IN_VALUE = process.env.STOCK_IN_VALUE         || '10';

// Colunas do CSV (0-indexed)
const COL_SLUG       = 0;   // Identificador URL
const COL_NOME       = 1;   // Nome
const COL_VARIACAO_V = 4;   // Valor da variação 1  ("Primária" / "Secundária")
const COL_PRECO      = 9;   // Preço
const COL_ESTOQUE    = 15;  // Estoque

const BASE_CSV   = path.join(__dirname, 'planilha-de-importação-nuvem-sagames.csv');
const OUT_DIR    = path.join(__dirname, 'output');
const OUT_CSV    = path.join(OUT_DIR, 'planilha-atualizada.csv');
const UPD_JSON   = path.join(OUT_DIR, 'updates.json');
const MAX_UPDATES = 500;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (!SITEMAP_URL) {
  console.error('❌ SITEMAP_URL não definido no .env');
  process.exit(1);
}

// ─── Estado Global ────────────────────────────────────────────────────────────
let isRunning = false;
const state = {
  status: 'idle',
  lastRun: null,
  lastDuration: null,
  totalScanned: 0,
  totalUpdated: 0,
  lastError: null,
  cronSchedule: MONITOR_CRON,
};

// ─── Mapeamento de slugs MK Games 2 → SA Games ────────────────────────────────
//
// Padrão descoberto inspecionando o sitemap:
//   MK Games 2: "god-of-war-ragnarok-para-ps4"
//   SA Games:   "god-of-war-ragnarok-ps4"
//
// A diferença é que MK usa "-para-" entre o título e a plataforma.
// Basta remover "-para-" para obter o slug SA Games.
//
function mkToSaSlug(mkSlug) {
  return mkSlug.replace(/-para-/g, '-');
}

// ─── Conversão de preço ───────────────────────────────────────────────────────
// "R$ 1.299,90" → "1299.90"
function parsePrice(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || /indispon|esgotado/i.test(s)) return null;

  let cleaned = s.replace(/[R$\s]/g, '');

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot   = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // formato BR: "1.299,90"
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // formato US: "1,299.90"
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
}

function slugFromUrl(url) {
  try { return url.replace(/\/$/, '').split('/').pop(); } catch { return null; }
}

// ─── Updates JSON ─────────────────────────────────────────────────────────────
function getUpdates() {
  try {
    if (fs.existsSync(UPD_JSON)) return JSON.parse(fs.readFileSync(UPD_JSON, 'utf8'));
  } catch {}
  return { recentUpdates: [] };
}

function saveUpdates(data) {
  fs.writeFileSync(UPD_JSON, JSON.stringify(data, null, 2), 'utf8');
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function readCSV(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // Remove BOM
  return csvParse(content, {
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: false,
  });
}

/**
 * Constrói mapa: saSlug → { primaryIdx, secondaryIdx, name }
 * A chave é sempre o slug no formato SA Games (sem "-para-").
 */
function buildProductMap(records) {
  const map = {};
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || !row[COL_SLUG] || !row[COL_SLUG].trim()) continue;

    const slug      = row[COL_SLUG].trim();
    const variation = (row[COL_VARIACAO_V] || '').trim().toLowerCase();
    const name      = (row[COL_NOME] || '').trim();

    if (!map[slug]) map[slug] = { primaryIdx: null, secondaryIdx: null, name: '' };
    if (name) map[slug].name = name;

    if (variation === 'primária' || variation === 'primaria') {
      map[slug].primaryIdx = i;
      if (name) map[slug].name = name;
    } else if (variation === 'secundária' || variation === 'secundaria') {
      map[slug].secondaryIdx = i;
    } else if (map[slug].primaryIdx === null) {
      map[slug].primaryIdx = i;
    }
  }
  return map;
}

/**
 * Carrega CSV base (estrutura + descrições) e CSV de saída anterior
 * (para detecção de mudanças entre ciclos).
 */
function loadCSVs() {
  const records = readCSV(BASE_CSV);

  let prevState = null;
  if (fs.existsSync(OUT_CSV)) {
    try {
      const prev = readCSV(OUT_CSV);
      prevState = {};
      for (let i = 1; i < prev.length; i++) {
        const row = prev[i];
        if (!row || !row[COL_SLUG] || !row[COL_SLUG].trim()) continue;
        const slug      = row[COL_SLUG].trim();
        const variation = (row[COL_VARIACAO_V] || '').trim().toLowerCase();
        if (!prevState[slug]) prevState[slug] = {};
        if (variation === 'primária' || variation === 'primaria') {
          prevState[slug].primary = { price: row[COL_PRECO] || '', stock: row[COL_ESTOQUE] || '' };
        } else if (variation === 'secundária' || variation === 'secundaria') {
          prevState[slug].secondary = { price: row[COL_PRECO] || '', stock: row[COL_ESTOQUE] || '' };
        }
      }
      console.log('📋  Estado anterior carregado para comparação de mudanças.');
    } catch (e) {
      console.warn('⚠️   Não foi possível carregar estado anterior:', e.message);
    }
  }

  return { records, prevState };
}

// ─── Ciclo de Monitoramento ───────────────────────────────────────────────────
async function startMonitoringCycle() {
  if (isRunning) {
    console.log('⚠️   Ciclo já em andamento.');
    return { success: false, reason: 'already_running' };
  }

  isRunning = true;
  state.status    = 'running';
  state.lastError = null;
  const startTime = Date.now();

  console.log('\n' + '═'.repeat(60));
  console.log(`🚀  Ciclo iniciado: ${getFormattedDate()}`);
  console.log('═'.repeat(60));

  const cycleChanges = [];

  try {
    // 1. CSV base + estado anterior
    const { records, prevState } = loadCSVs();
    const productMap = buildProductMap(records);
    const csvTotal   = Object.keys(productMap).length;
    console.log(`📊  ${csvTotal} produtos únicos na planilha SA Games`);

    // 2. Sitemap MK Games 2
    const productUrls = await getSitemapUrls(SITEMAP_URL);
    if (!productUrls.length) throw new Error('Nenhum produto no sitemap');
    console.log(`🌐  ${productUrls.length} URLs no sitemap MK Games 2`);

    // 3. Pré-computar estatísticas de mapeamento
    //    MK slug → SA slug via: remover "-para-"
    //    Exemplos:
    //      "god-of-war-ragnarok-para-ps4"  → "god-of-war-ragnarok-ps4"  ✓
    //      "resident-evil-2-para-ps4"      → "resident-evil-2-ps4"      ✓
    let directCount  = 0;
    let convertCount = 0;
    for (const u of productUrls) {
      const mk = slugFromUrl(u);
      if (productMap[mk])                   directCount++;
      else if (productMap[mkToSaSlug(mk)])   convertCount++;
    }
    console.log(`🔗  Mapeamento MK→SA:`);
    console.log(`    ✅ Slug idêntico         : ${directCount}`);
    console.log(`    🔄 Convertido (-para-)   : ${convertCount}`);
    console.log(`    📌 Total mapeado         : ${directCount + convertCount} / ${csvTotal}`);
    if (directCount + convertCount === 0) {
      console.warn('⚠️   Nenhum produto foi mapeado! Verifique SITEMAP_URL no .env');
    }

    let okCount       = 0;
    let errCount      = 0;
    let skipCount     = 0;
    let paraHitCount  = 0;
    const totalBatches = Math.ceil(productUrls.length / BATCH_SIZE);

    // 4. Processa em lotes
    for (let b = 0; b < productUrls.length; b += BATCH_SIZE) {
      const batch    = productUrls.slice(b, b + BATCH_SIZE);
      const batchNum = Math.floor(b / BATCH_SIZE) + 1;
      process.stdout.write(`\r   Lote ${batchNum}/${totalBatches} | ✅ ${okCount} | ❌ ${errCount} | ⏭️  ${skipCount}   `);

      await Promise.all(batch.map(async (url) => {
        const mkSlug = slugFromUrl(url);
        if (!mkSlug) { skipCount++; return; }

        // Mapeamento: 1º slug idêntico, 2º converte removendo "-para-"
        let info         = productMap[mkSlug];
        let csvSlug      = mkSlug;
        let usedConvert  = false;

        if (!info) {
          const saSlug = mkToSaSlug(mkSlug);
          if (productMap[saSlug]) {
            info        = productMap[saSlug];
            csvSlug     = saSlug;
            usedConvert = true;
          }
        }

        // Produto não existe na planilha SA Games → pula
        if (!info) { skipCount++; return; }

        try {
          const scraped = await scrapeProduct(url);
          if (!scraped) { errCount++; return; }

          const changes = [];
          // Estado anterior usa csvSlug (slug SA Games, chave da planilha)
          const prev = prevState ? (prevState[csvSlug] || null) : null;

          // ── Variação Primária ──────────────────────────────────────
          if (info.primaryIdx !== null) {
            const row      = records[info.primaryIdx];
            const newPrice = parsePrice(scraped.primary.price);
            const newStock = scraped.primary.stock ? STOCK_IN_VALUE : '0';

            if (newPrice !== null) {
              if (prev && prev.primary && prev.primary.price !== newPrice) {
                changes.push({
                  variation: 'Primária', type: 'price',
                  from: prev.primary.price, to: newPrice,
                });
              }
              row[COL_PRECO] = newPrice;
            }

            if (prev && prev.primary) {
              const prevStock = String(prev.primary.stock || '');
              if (prevStock !== newStock) {
                changes.push({
                  variation: 'Primária', type: 'stock',
                  from: prevStock === '0' ? 'Sem estoque' : (prevStock === '' ? 'Não rastreado' : 'Em estoque'),
                  to:   newStock  === '0' ? 'Sem estoque' : 'Em estoque',
                });
              }
            }
            row[COL_ESTOQUE] = newStock;
          }

          // ── Variação Secundária ────────────────────────────────────
          if (info.secondaryIdx !== null) {
            const row      = records[info.secondaryIdx];
            const newPrice = parsePrice(scraped.secondary.price);
            const newStock = scraped.secondary.stock ? STOCK_IN_VALUE : '0';

            if (newPrice !== null) {
              if (prev && prev.secondary && prev.secondary.price !== newPrice) {
                changes.push({
                  variation: 'Secundária', type: 'price',
                  from: prev.secondary.price, to: newPrice,
                });
              }
              row[COL_PRECO] = newPrice;
            }

            if (prev && prev.secondary) {
              const prevStock = String(prev.secondary.stock || '');
              if (prevStock !== newStock) {
                changes.push({
                  variation: 'Secundária', type: 'stock',
                  from: prevStock === '0' ? 'Sem estoque' : (prevStock === '' ? 'Não rastreado' : 'Em estoque'),
                  to:   newStock  === '0' ? 'Sem estoque' : 'Em estoque',
                });
              }
            }
            row[COL_ESTOQUE] = newStock;
          }

          okCount++;
          if (usedConvert) paraHitCount++;

          if (changes.length > 0) {
            cycleChanges.push({ slug: csvSlug, name: info.name, url, changes, cycleDate: new Date().toISOString() });
            console.log(`\n   🔄  ${info.name} (${changes.length} mudança${changes.length > 1 ? 's' : ''})`);
            changes.forEach(c => {
              const icon   = c.type === 'price' ? '💰' : '📦';
              const detail = c.type === 'price'
                ? `R$ ${c.from} → R$ ${c.to}`
                : `${c.from} → ${c.to}`;
              console.log(`       ${icon} [${c.variation}] ${detail}`);
            });
          }

        } catch (err) {
          errCount++;
          console.error(`\n   ❌  Erro em ${mkSlug}: ${err.message}`);
        }
      }));

      if (b + BATCH_SIZE < productUrls.length) await sleep(600);
    }

    await closeBrowser();

    // 5. Salva CSV atualizado
    console.log('\n\n💾  Salvando planilha atualizada...');
    const csvOut = csvStringify(records, {
      delimiter: ';',
      record_delimiter: '\r\n',
      quoted_string: true,
    });
    fs.writeFileSync(OUT_CSV, csvOut, 'utf8');
    console.log(`✅  Planilha salva → output/planilha-atualizada.csv`);

    // 6. Salva histórico de atualizações
    const updData = getUpdates();
    updData.recentUpdates = [...cycleChanges, ...(updData.recentUpdates || [])].slice(0, MAX_UPDATES);
    saveUpdates(updData);

    // 7. Atualiza estado
    const durationMs  = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(1);

    state.status       = 'idle';
    state.lastRun      = new Date().toISOString();
    state.lastDuration = `${durationMin} min`;
    state.totalScanned = okCount;
    state.totalUpdated = cycleChanges.length;

    console.log(`\n✅  Ciclo concluído em ${durationMin} min — ${getFormattedDate()}`);
    console.log(`📊  MK→SA: ${okCount} produtos (direto: ${okCount - paraHitCount} | conv. -para-: ${paraHitCount})`);
    console.log(`⏭️   Sem correspondência: ${skipCount} | ❌ Erros: ${errCount}`);
    console.log(`🔄  Alterações detectadas: ${cycleChanges.length}`);

    return { success: true };

  } catch (err) {
    console.error('\n❌  Erro fatal no ciclo:', err.message);
    state.status    = 'error';
    state.lastError = err.message;
    try { await closeBrowser(); } catch {}
    return { success: false, error: err.message };

  } finally {
    isRunning = false;
  }
}

// ─── Cron ─────────────────────────────────────────────────────────────────────
let cronJob = null;
function startCron() {
  if (cronJob) return;
  cronJob = cron.schedule(MONITOR_CRON, () => {
    console.log(`\n⏰  Cron disparado: ${getFormattedDate()}`);
    startMonitoringCycle().catch(console.error);
  });
  console.log(`📅  Cron agendado: ${MONITOR_CRON}`);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  getState:   () => ({ ...state }),
  getUpdates,
  startScan:  startMonitoringCycle,
  isRunning:  () => isRunning,
  startCron,
};

// ─── Standalone ───────────────────────────────────────────────────────────────
if (require.main === module) {
  console.log('🤖  SA Games Monitor — Standalone\n');
  console.log(`🌐  Sitemap: ${SITEMAP_URL}`);
  startCron();
  startMonitoringCycle().catch(console.error);
}
