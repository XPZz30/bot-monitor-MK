const puppeteer = require('puppeteer');

let browserInstance = null;
let browserPromise  = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-images',
        '--no-first-run',
        '--no-zygote',
        '--disable-accelerated-2d-canvas',
        '--disable-software-rasterizer',
      ]
    });
  }
  browserInstance = await browserPromise;
  return browserInstance;
}

/**
 * Raspa preço e estoque das variações Primária e Secundária de um produto.
 * Otimizações de velocidade:
 *  - Bloqueia imagens, fontes e CSS
 *  - Usa domcontentloaded (sem esperar rede)
 *  - Substituiu waitForTimeout(2000) por waitForFunction com máx 800ms
 *
 * @param {string} url - URL do produto no MK Games 2
 * @returns {Object|null}
 */
async function scrapeProduct(url) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Bloqueia recursos desnecessários para máxima velocidade
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(t)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Tenta encontrar o preço. Se falhar (ex: página não existe, produto oculto), retorna sem erro.
    const priceEl = await page.waitForSelector('#price_display', { timeout: 8000 }).catch(() => null);
    if (!priceEl) {
      return {
        url,
        primary: { price: null, stock: false },
        secondary: { price: null, stock: false }
      };
    }

    // ── Variação Primária (já selecionada por padrão) ───────────────────────
    const [primaryPrice, primaryStockRaw] = await Promise.all([
      page.$eval('#price_display', el => el.textContent.trim()).catch(() => null),
      page.$eval('[data-store="product-buy-button"]', el => el.value.toLowerCase()).catch(() => ''),
    ]);
    const primaryStock = primaryStockRaw.includes('comprar');

    // ── Variação Secundária ──────────────────────────────────────────────────
    let secondaryPrice = null;
    let secondaryStock = false;

    const hasVariation = await page.$('[data-variant-id="variation_1"]')
      .then(el => el !== null).catch(() => false);

    if (hasVariation) {
      // Captura preço atual para detectar mudança após troca de variação
      const priceBefore = primaryPrice;

      await page.select('[data-variant-id="variation_1"]', 'SECUNDÁRIA');

      // ✅ Espera o preço MUDAR no DOM — mais rápido que waitForTimeout fixo.
      // Se não mudar em 800ms (ex: variação sem preço diferente), continua mesmo assim.
      await page.waitForFunction(
        (before) => {
          const el = document.querySelector('#price_display');
          return el && el.textContent.trim() !== before;
        },
        { timeout: 800 },
        priceBefore
      ).catch(() => { /* price may not change for some products — ok */ });

      const [secPrice, secStockRaw] = await Promise.all([
        page.$eval('#price_display', el => el.textContent.trim()).catch(() => null),
        page.$eval('[data-store="product-buy-button"]', el => el.value.toLowerCase()).catch(() => ''),
      ]);
      secondaryPrice = secPrice;
      secondaryStock = secStockRaw.includes('comprar');
    }

    return {
      url,
      primary:   { price: primaryPrice,   stock: primaryStock },
      secondary: { price: secondaryPrice, stock: secondaryStock },
    };

  } catch (err) {
    // Não loga por padrão — monitor.js já conta errCount
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
    browserPromise  = null;
  }
}

module.exports = { scrapeProduct, closeBrowser };
