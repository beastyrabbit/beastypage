# syntax=docker/dockerfile:1.25

# Stage 1: Install dependencies
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build application
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars for Next.js (passed via --build-arg)
# Use placeholders - replaced at runtime by entrypoint script
ARG NEXT_PUBLIC_POSTHOG_KEY=phc_PLACEHOLDER_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST=https://placeholder.posthog.com
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_placeholder_CLERK_KEY
ARG APP_VERSION=dev
ARG CAT_SYSTEM_CATALOG_HASH=unknown

ENV APP_VERSION=${APP_VERSION}
ENV CAT_SYSTEM_CATALOG_HASH=${CAT_SYSTEM_CATALOG_HASH}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}

# A CI image may only advertise the contract embedded in this source tree.
# `unknown` remains available for local ad-hoc builds that do not stamp OCI
# metadata; every Forgejo build passes the concrete generated hash.
RUN test "$CAT_SYSTEM_CATALOG_HASH" = "unknown" \
    || test "$(cat public/cat-system/catalog-hash.txt)" = "$CAT_SYSTEM_CATALOG_HASH"

# Build Next.js with standalone output
RUN pnpm run build

# Self-contained PostgreSQL migration and import/verification runners.
# Archive and report paths remain outside the image under /work.
RUN pnpm run db:bundle && pnpm run db:bundle-import

# Stage 3: Production image (Node-based for standalone compatibility)
FROM node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runner
WORKDIR /app

ARG CAT_SYSTEM_CATALOG_HASH=unknown
LABEL dev.beastypage.cat-system.catalog-hash=${CAT_SYSTEM_CATALOG_HASH}

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV CAT_SYSTEM_CATALOG_HASH=${CAT_SYSTEM_CATALOG_HASH}

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
# Note: Files need write permissions for runtime env var injection in entrypoint script
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/dist-db/scripts/db/migrate.mjs ./scripts/db/migrate.mjs
COPY --from=builder /app/dist-db/scripts/migration ./scripts/migration
COPY --from=builder /app/drizzle ./drizzle

# Ensure directories are writable for runtime placeholder replacement
# /app needs to be writable for sed -i to create temp files
RUN chown nextjs:nodejs /app && chmod -R u+w /app/.next

# Copy entrypoint script for runtime env var injection
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
