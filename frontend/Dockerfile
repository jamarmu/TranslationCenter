# --- Build Stage ---
FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY vite.config.js index.html ./
COPY src ./src

RUN npm run build

# --- Production Stage ---
FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js users.json ./
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 8080

CMD ["node", "server.js"]
