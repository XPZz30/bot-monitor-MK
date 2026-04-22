# 🎯 Lógica de Captura de Preços (Primária e Secundária)

Este documento explica a estratégia completa de scraping utilizada no bot para capturar preços e estoque de variações de produtos.

---

## 📋 **CONTEXTO**

O site usa **NuvemShop** onde produtos têm variações (ex: "Primária" e "Secundária"). Precisamos capturar:
- Preço de cada variação
- Estoque de cada variação

---

## 🔍 **ETAPA 1: Estrutura HTML do Site**

### **Seletor de Variação**
```html
<select data-variant-id="variation_1">
    <option value="PRIMÁRIA">Primária</option>
    <option value="SECUNDÁRIA">Secundária</option>
</select>
```

### **Display de Preço**
```html
<span id="price_display">R$ 19,90</span>
```

### **Botão de Compra (indica estoque)**
```html
<!-- Quando TEM estoque -->
<input type="submit" value="Comprar" 
       data-store="product-buy-button" />

<!-- Quando NÃO TEM estoque -->
<input type="submit" value="Sem Estoque" 
       data-store="product-buy-button" />
```

---

## ⚙️ **ETAPA 2: Estratégia de Captura**

### **Fluxo Completo**

```
1. Abrir URL do produto
2. Aguardar carregamento completo
3. LER PRIMÁRIA (já vem selecionada por padrão)
   ├─ Capturar preço do #price_display
   └─ Verificar estoque pelo value do botão
4. TROCAR para SECUNDÁRIA
   ├─ Usar page.select() para mudar variação
   └─ Aguardar atualização do preço (500ms)
5. LER SECUNDÁRIA
   ├─ Capturar novo preço do #price_display
   └─ Verificar novo estoque do botão
6. Retornar objeto com ambos os dados
```

---

## 💻 **ETAPA 3: Implementação em Código**

### **Código Completo**

```javascript
const puppeteer = require('puppeteer');

async function scrapeProduct(url) {
    const browser = await puppeteer.launch({
        headless: true, // ou false para ver o navegador
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    try {
        console.log(`🌐 Acessando: ${url}`);
        
        // 1️⃣ ABRIR A PÁGINA
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // 2️⃣ AGUARDAR ELEMENTOS CARREGAREM
        await page.waitForSelector('#price_display', { timeout: 10000 });
        await page.waitForSelector('[data-store="product-buy-button"]', { timeout: 10000 });

        // ============================================
        // 3️⃣ CAPTURAR DADOS DA VARIAÇÃO PRIMÁRIA
        // ============================================
        console.log('📊 Lendo variação PRIMÁRIA...');
        
        // Ler preço
        const primaryPrice = await page.$eval(
            '#price_display', 
            el => el.textContent.trim()
        );

        // Ler estoque (verifica o atributo 'value' do input)
        const primaryStockValue = await page.$eval(
            'input[data-store="product-buy-button"]',
            el => el.value
        );
        const primaryStock = primaryStockValue.toLowerCase().includes('comprar');

        console.log(`✅ Primária: ${primaryPrice} | Estoque: ${primaryStock ? 'Disponível' : 'Indisponível'}`);

        // ============================================
        // 4️⃣ TROCAR PARA VARIAÇÃO SECUNDÁRIA
        // ============================================
        console.log('🔄 Trocando para variação SECUNDÁRIA...');
        
        // Selecionar a segunda opção do select
        await page.select('[data-variant-id="variation_1"]', 'SECUNDÁRIA');
        
        // IMPORTANTE: Aguardar o preço atualizar no DOM
        await page.waitForTimeout(500);

        // ============================================
        // 5️⃣ CAPTURAR DADOS DA VARIAÇÃO SECUNDÁRIA
        // ============================================
        console.log('📊 Lendo variação SECUNDÁRIA...');
        
        // Ler novo preço
        const secondaryPrice = await page.$eval(
            '#price_display', 
            el => el.textContent.trim()
        );

        // Ler novo estoque
        const secondaryStockValue = await page.$eval(
            'input[data-store="product-buy-button"]',
            el => el.value
        );
        const secondaryStock = secondaryStockValue.toLowerCase().includes('comprar');

        console.log(`✅ Secundária: ${secondaryPrice} | Estoque: ${secondaryStock ? 'Disponível' : 'Indisponível'}`);

        // ============================================
        // 6️⃣ RETORNAR DADOS ESTRUTURADOS
        // ============================================
        return {
            primary: {
                price: primaryPrice,
                stock: primaryStock
            },
            secondary: {
                price: secondaryPrice,
                stock: secondaryStock
            }
        };

    } catch (error) {
        console.error('❌ Erro ao fazer scraping:', error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeProduct };
```

---

## 🔑 **PONTOS-CHAVE DA LÓGICA**

### **1. Por que não precisa clicar na Primária?**
```javascript
// A variação PRIMÁRIA já vem selecionada por padrão ao abrir a página
// Então apenas lemos os valores diretamente
```

### **2. Como trocar de variação?**
```javascript
// Usar page.select() com o valor exato da option
await page.select('[data-variant-id="variation_1"]', 'SECUNDÁRIA');
```

### **3. Por que aguardar 500ms após trocar?**
```javascript
// O site usa JavaScript para atualizar o preço dinamicamente
// Sem o delay, você captura o preço ANTIGO (da primária)
await page.waitForTimeout(500);
```

### **4. Como detectar estoque?**
```javascript
// NÃO usar o texto do botão (.textContent)
// USAR o atributo 'value' do input
const stockValue = await page.$eval(
    'input[data-store="product-buy-button"]',
    el => el.value // ← Pega o atributo value
);

// Se value contém "Comprar" = TEM estoque
// Se value contém "Sem Estoque" = NÃO TEM estoque
const inStock = stockValue.toLowerCase().includes('comprar');
```

---

## 📊 **RETORNO ESPERADO**

```json
{
  "primary": {
    "price": "R$17,00",
    "stock": true
  },
  "secondary": {
    "price": "R$15,00",
    "stock": false
  }
}
```

---

## ⚠️ **ERROS COMUNS E SOLUÇÕES**

| Erro | Causa | Solução |
|------|-------|---------|
| Preço secundário = primário | Não aguardou atualização | Adicione `waitForTimeout(500)` |
| Estoque sempre true/false | Lendo texto errado | Use `el.value` no input, não `.textContent` |
| Timeout ao carregar | Página lenta | Aumente timeout ou use `networkidle0` |
| Seletor não encontrado | HTML mudou | Inspecione a página e atualize seletores |

---

## 🎯 **PARA REPLICAR EM OUTROS PROJETOS**

### **1. Identifique os seletores CSS**
```javascript
// Inspecione a página (F12) e encontre:
const SELECTORS = {
    price: '#price_display',              // Onde está o preço
    buyButton: '[data-store="product-buy-button"]', // Botão de compra
    variantSelect: '[data-variant-id="variation_1"]' // Select de variações
};
```

### **2. Adapte a lógica de variação**
```javascript
// Se o site usa botões ao invés de select:
await page.click('.variant-button[data-variant="secundaria"]');

// Se usa links:
await page.goto(url + '?variant=secundaria');

// Se usa radio buttons:
await page.click('input[value="SECUNDÁRIA"]');
```

### **3. Adapte a detecção de estoque**
```javascript
// Opção 1: Texto do botão
const hasStock = await page.$eval('.buy-btn', el => 
    !el.textContent.includes('Indisponível')
);

// Opção 2: Classe CSS
const hasStock = await page.$('.in-stock') !== null;

// Opção 3: Atributo disabled
const hasStock = await page.$eval('.buy-btn', el => 
    !el.disabled
);
```

---

## 🚀 **RESUMO EXECUTIVO**

### **Passo a passo rápido:**

1. Abrir página com puppeteer
2. Aguardar seletores principais carregarem
3. Ler preço + estoque da variação padrão
4. Trocar variação usando `page.select()`
5. Aguardar 500ms para DOM atualizar
6. Ler novo preço + estoque
7. Retornar objeto estruturado
8. Fechar navegador

---

## 📝 **EXEMPLO DE USO**

```javascript
const { scrapeProduct } = require('./scraper/productScraper');

async function main() {
    const url = 'https://loja.com.br/produtos/fifa-23/';
    
    try {
        const data = await scrapeProduct(url);
        console.log('Dados capturados:', data);
        
        // Output:
        // {
        //   primary: { price: 'R$17,00', stock: true },
        //   secondary: { price: 'R$15,00', stock: false }
        // }
    } catch (error) {
        console.error('Erro:', error);
    }
}

main();
```

---

## 🔧 **TECNOLOGIAS UTILIZADAS**

- **Puppeteer**: Automação de navegador
- **Node.js**: Runtime JavaScript
- **CSS Selectors**: Para localizar elementos no DOM

---

## 📚 **REFERÊNCIAS**

- [Documentação Puppeteer](https://pptr.dev/)
- [CSS Selectors](https://developer.mozilla.org/pt-BR/docs/Web/CSS/CSS_Selectors)
- [NuvemShop API](https://tiendanube.github.io/api-documentation/)

---

**Essa lógica funciona para qualquer site de e-commerce que tenha variações dinâmicas!** 🎉
