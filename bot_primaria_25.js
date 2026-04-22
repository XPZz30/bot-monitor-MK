require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeProduct, closeBrowser } = require('./scraper/productScraper');
const { getSitemapUrls, extractProductName, getFormattedDate } = require('./utils');

process.setMaxListeners(0);

// Configurações
const SITEMAP_URL = process.env.SITEMAP_URL;
const BATCH_SIZE = 10; // Processar 10 produtos em paralelo
const MAX_PRICE = 25.00;
const OUTPUT_FILE = 'promocoes_primaria_25.json';

/**
 * Converte string de preço (ex: "R$ 19,90") para número (19.90)
 * @param {string} priceStr 
 * @returns {number}
 */
function parsePrice(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return Infinity;
    // Remove "R$", pontos de milhar e substitui vírgula por ponto
    const cleanStr = priceStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(cleanStr);
}

/**
 * Função principal do bot de promoções
 */
async function runPromoBot() {
    try {
        console.log('\n');
        console.log('╔═══════════════════════════════════════════════════════════════╗');
        console.log('║        🎮 BOT LICENÇA PRIMÁRIA EM ESTOQUE (< R$ 25)         ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝');
        console.log(`\n⏰ Iniciado em: ${getFormattedDate()}\n`);

        if (!SITEMAP_URL) {
            throw new Error('❌ Variável SITEMAP_URL não configurada no .env');
        }

        // 1️⃣ Baixa URLs do sitemap
        const productUrls = await getSitemapUrls(SITEMAP_URL);

        if (productUrls.length === 0) {
            console.log('⚠️ Nenhum produto encontrado no sitemap');
            return;
        }

        console.log(`\n📦 Total: ${productUrls.length} produtos | Lotes de ${BATCH_SIZE}\n`);

        const promotions = [];
        let processedCount = 0;

        // 2️⃣ Processa produtos em lotes
        for (let i = 0; i < productUrls.length; i += BATCH_SIZE) {
            const batch = productUrls.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(productUrls.length / BATCH_SIZE);

            console.log(`\n🚀 Lote ${batchNumber}/${totalBatches} (${batch.length} produtos)`);

            // Reinicia o navegador a cada 5 lotes para liberar memória
            if (i > 0 && (i / BATCH_SIZE) % 5 === 0) {
                console.log('♻️ Reiniciando navegador para liberar memória...');
                await closeBrowser();
            }

            try {
                const batchResults = await Promise.all(
                    batch.map(async (url) => {
                        try {
                            const data = await scrapeProduct(url);
                            processedCount++;
                            process.stdout.write('.'); // Feedback visual de progresso
                            return data;
                        } catch (e) {
                            console.error(`\n❌ Erro ao processar ${url}: ${e.message}`);
                            return null;
                        }
                    })
                );

                // 3️⃣ Filtra os resultados (Apenas Primária)
                let newPromotionsCount = 0;
                for (const data of batchResults) {
                    if (!data) continue;

                    const primPrice = parsePrice(data.primary.price);
                    const primStock = data.primary.stock;

                    // Verifica se Primária atende ao critério
                    if (primStock && primPrice < MAX_PRICE) {
                        const productName = extractProductName(data.url);
                        console.log(`\n✨ ENCONTRADO: ${productName} - ${data.primary.price} (Primária)`);

                        promotions.push({
                            name: productName,
                            url: data.url,
                            image: data.image,
                            price: data.primary.price,
                            priceValue: primPrice,
                            type: 'Primária',
                            stock: true,
                            capturedAt: new Date().toISOString()
                        });
                        newPromotionsCount++;
                    }
                }

                // Salva incrementalmente se houve novas promoções ou a cada 5 lotes
                if (newPromotionsCount > 0 || (i / BATCH_SIZE) % 5 === 0) {
                    fs.writeFileSync(
                        path.join(__dirname, OUTPUT_FILE),
                        JSON.stringify(promotions, null, 2),
                        'utf-8'
                    );
                }

            } catch (batchError) {
                console.error(`\n❌ Erro crítico no lote ${batchNumber}:`, batchError.message);
                // Tenta fechar o navegador em caso de erro crítico no lote
                await closeBrowser();
            }
        }

        // Fechar navegador
        await closeBrowser();

        // 4️⃣ Salva os resultados finais em arquivo
        console.log(`\n\n💾 Salvando ${promotions.length} promoções em ${OUTPUT_FILE}...`);

        fs.writeFileSync(
            path.join(__dirname, OUTPUT_FILE),
            JSON.stringify(promotions, null, 2),
            'utf-8'
        );

        console.log('\n');
        console.log('╔═══════════════════════════════════════════════════════════════╗');
        console.log('║                  ✅ BOT FINALIZADO COM SUCESSO               ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝');
        console.log(`⏰ Finalizado em: ${getFormattedDate()}`);
        console.log(`📊 Total processado: ${processedCount}`);
        console.log(`🎯 Promoções encontradas: ${promotions.length}\n`);

    } catch (error) {
        console.error('\n❌ ERRO FATAL:', error.message);
        process.exit(1);
    }
}

// Executa o bot
if (require.main === module) {
    runPromoBot();
}
