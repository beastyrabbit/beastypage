# syntax=docker/dockerfile:1.6

# Stage 1: Install dependencies
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# Stage 2: Build application
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars for Next.js (passed via --build-arg)
ARG CONVEX_DEPLOYMENT
# Use placeholders - replaced at runtime by entrypoint script
# Must be valid formats for Next.js parsing at build time
ARG NEXT_PUBLIC_CONVEX_URL=https://placeholder.convex.cloud
ARG NEXT_PUBLIC_POSTHOG_KEY=phc_PLACEHOLDER_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST=https://placeholder.posthog.com
ARG APP_VERSION=dev

ENV CONVEX_DEPLOYMENT=${CONVEX_DEPLOYMENT}
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}

# Build Next.js with standalone output
# Note: convex codegen runs via pre-commit hook, types are in git
RUN bun run build

# Stage 3: Production image (Node-based for standalone compatibility)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
# Note: Files need write permissions for runtime env var injection in entrypoint script
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure directories are writable for runtime placeholder replacement
# /app needs to be writable for sed -i to create temp files
RUN chown nextjs:nodejs /app && chmod -R u+w /app/.next

# Copy entrypoint script for runtime env var injection
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
