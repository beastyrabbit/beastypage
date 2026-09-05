ARG CAT_SYSTEM_CATALOG_HASH=unknown

FROM node:24-alpine AS builder
ARG CAT_SYSTEM_CATALOG_HASH
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN test "$CAT_SYSTEM_CATALOG_HASH" = "unknown" \
    || test "$(cat src/generated/catalog-hash.txt)" = "$CAT_SYSTEM_CATALOG_HASH"
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ARG CAT_SYSTEM_CATALOG_HASH
LABEL dev.beastypage.cat-system.catalog-hash=${CAT_SYSTEM_CATALOG_HASH}
ENV CAT_SYSTEM_CATALOG_HASH=${CAT_SYSTEM_CATALOG_HASH}
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
