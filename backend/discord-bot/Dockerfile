ARG CAT_SYSTEM_CATALOG_HASH=unknown

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
ARG CAT_SYSTEM_CATALOG_HASH
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ src/
RUN test "$CAT_SYSTEM_CATALOG_HASH" = "unknown" \
    || test "$(cat src/generated/catalog-hash.txt)" = "$CAT_SYSTEM_CATALOG_HASH"
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app
ARG CAT_SYSTEM_CATALOG_HASH
LABEL dev.beastypage.cat-system.catalog-hash=${CAT_SYSTEM_CATALOG_HASH}
ENV CAT_SYSTEM_CATALOG_HASH=${CAT_SYSTEM_CATALOG_HASH}
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
