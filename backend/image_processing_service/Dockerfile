FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY tsconfig.json ./
COPY src/ src/

# ---- Runtime ----
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/tsconfig.json tsconfig.json
COPY --from=builder /app/src src

ENV NODE_ENV=production
ENV PORT=8002

EXPOSE 8002

CMD ["node", "--experimental-strip-types", "src/index.ts"]
