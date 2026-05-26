# Build context is the repo root (see railway.toml). Paths use server/.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", "dist/index.js"]
