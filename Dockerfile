FROM node:18-alpine

# Instalar dependências necessárias
RUN apk add --no-cache python3 make g++

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p /app/backups

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["node", "server.js"]
