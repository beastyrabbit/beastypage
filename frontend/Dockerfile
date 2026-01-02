# syntax=docker/dockerfile:1.6

# Stage 1: Install dependencies
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build application
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars for Next.js
ENV NEXT_PUBLIC_CONVEX_URL=https://standing-crane-709.convex.cloud
ENV NEXT_PUBLIC_POSTHOG_KEY=phc_tFlnQBrAuQMdW8JwJt0lzihPGBRjfDkBUstD5K4OYhk
ENV NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

# Build Next.js with standalone output
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
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
