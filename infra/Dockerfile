# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN --mount=type=secret,id=proxy_ca \
    ca_option=""; \
    if [ -f /run/secrets/proxy_ca ]; then ca_option="-o Acquire::https::CaInfo=/run/secrets/proxy_ca"; fi; \
    apt-get $ca_option update && apt-get $ca_option install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS build
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true && npx prisma generate && npm run build && npm prune --omit=dev && npm cache clean --force && rm -rf src tests docs scripts infra .github tsconfig*.json
FROM base AS migration
WORKDIR /app
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true && npx prisma generate && npm cache clean --force
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
CMD ["node","dist/main.js"]
