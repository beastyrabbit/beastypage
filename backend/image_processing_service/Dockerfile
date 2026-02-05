FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src/ src/

# ---- Runtime ----
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/tsconfig.json tsconfig.json
COPY --from=builder /app/src src

ENV NODE_ENV=production
ENV PORT=8002

EXPOSE 8002

CMD ["bun", "run", "src/index.ts"]
