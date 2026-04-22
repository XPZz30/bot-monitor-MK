# ─── Imagem base com Puppeteer + Chrome já instalados ─────────────────────────
FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Usa o Chrome do sistema (não baixa separado)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

WORKDIR /app

# Instala dependências primeiro (cache de layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o restante do código
COPY . .

# Pasta de saída persistente (montar como volume no docker-compose)
RUN mkdir -p output

EXPOSE 3000

CMD ["node", "server.js"]
