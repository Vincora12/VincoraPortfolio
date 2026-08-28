FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts server.test.ts ./
RUN npm run build
ENV MEM0_HISTORY_DB_PATH=/data/mem0-history.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["npm","start"]
