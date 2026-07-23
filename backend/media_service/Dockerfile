FROM node:24-bookworm-slim AS dependencies

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 quickshare \
    && useradd --system --uid 10001 --gid quickshare --home-dir /app quickshare

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

RUN mkdir -p /tmp/quick-share \
    && chown -R quickshare:quickshare /app /tmp/quick-share

USER 10001:10001
ENV NODE_ENV=production
ENV PORT=8003
ENV TEMP_DIR=/tmp/quick-share
EXPOSE 8003

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--experimental-strip-types", "src/index.ts"]
