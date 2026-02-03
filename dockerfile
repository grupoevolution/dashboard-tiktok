FROM node:18-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./

# Instalar dependências de build necessárias para better-sqlite3
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    && npm install --production \
    && apk del .build-deps

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p /app/backups

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["node", "server.js"]
