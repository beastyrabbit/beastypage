FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

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
