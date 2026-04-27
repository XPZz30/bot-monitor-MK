# ─── Imagem base com Puppeteer + Chrome já instalados ─────────────────────────
FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Usa o Chrome do sistema (não baixa separado)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

WORKDIR /app

# Instala dependências primeiro (cache de layer)
COPY --chown=pptruser:pptruser package*.json ./
RUN npm install --omit=dev

# Copia o restante do código
COPY --chown=pptruser:pptruser . .

# Pasta de saída persistente (montar como volume no docker-compose)
RUN mkdir -p output

EXPOSE 3000

CMD ["node", "server.js"]
