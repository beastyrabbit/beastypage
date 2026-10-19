# BeastyPage Frontend - Development Context

This is a Next.js 16 application with React 19, using PostgreSQL (Drizzle) as the database.

## Project Overview

A pixel cat gacha platform featuring:
- Cat generators with ClanGen sprites
- Gacha wheels and adoption mechanics
- Catdex (Pokedex-style cat browser)
- Stream tools for audience interaction

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, TailwindCSS, Radix UI primitives
- **Database**: PostgreSQL via Drizzle (CNPG cluster `beastypage-postgres` in production)
- **Auth**: Clerk
- **Data fetching**: TanStack Query hooks in `lib/data/`, live updates over SSE
- **Package Manager**: pnpm
- **Linter/Formatter**: Biome
- **Analytics**: PostHog (optional)

## Directory Structure

```
frontend/
├── app/                    # Next.js App Router pages and API routes (app/api)
│   ├── projects/           # Category hubs (gacha, games, tools, artist, warrior-cats)
│   ├── single-cat-plus/    # Cat generator
│   ├── catdex/             # Cat collection browser
│   ├── wheel/              # Gacha wheel
│   ├── adoption-generator/ # Litter adoption flow
│   ├── visual-builder/     # Trait-by-trait builder
│   └── stream/             # Stream tools
├── components/             # React components
│   ├── common/             # Shared UI components
│   ├── ui/                 # Radix-based primitives
│   └── ...                 # Feature-specific components
├── server/                 # Server-only code
│   ├── db/                 # Pool, Drizzle schema, migrator, transactions
│   ├── repositories/       # Table access
│   ├── services/           # Business logic called by API routes
│   ├── jobs/               # PostgreSQL job worker and job kinds
│   └── live/               # LISTEN/NOTIFY live updates
├── drizzle/                # SQL migrations
├── lib/                    # Utilities and helpers
│   ├── data/               # Client data hooks
│   └── live/               # Live updates over SSE
├── scripts/                # Development and build scripts
│   └── db/                 # Local PostgreSQL and Drizzle migration tools
├── public/                 # Static assets (sprites, images)
└── proxy.ts                # Clerk middleware, maintenance gate and routing
```

## Development Commands

```bash
pnpm install             # Install dependencies
pnpm run dev             # Start dev server (port via portless)
pnpm run build           # Production build
pnpm run lint            # Lint check
pnpm run typecheck       # TypeScript check

# Database
pnpm run db:local up     # Start the worktree's local PostgreSQL (writes .env.database.local)
pnpm run db:migrate      # Apply migrations
pnpm run db:generate     # Generate a migration after a schema change
pnpm run test:db         # Database tests (wipes the local worktree database)
```

## Key Conventions

### pnpm

- Use `pnpm install` for dependency management
- Use `pnpm exec tsx <file>` to run TypeScript scripts
- Use `pnpm run test` (vitest) for testing
- If `pnpm add` fails with "Unexpected store location" (store v10 vs v11 mismatch), use `pnpm dlx pnpm@10 add <pkg>`

### Component Patterns

- Page components in `app/*/page.tsx`
- Shared UI in `components/common/`
- Use TailwindCSS for styling
- Radix primitives wrapped in `components/ui/`

### Data Patterns

- Browsers never talk to PostgreSQL: components use the hooks in `lib/data/`, which call `app/api` routes
- API routes validate input and call `server/services/*`; services use `server/repositories/*`
- Schema changes go through Drizzle migrations in `drizzle/`; the frontend init container runs them before each rollout
- The app role has DML only and owns no tables — catalog queries must use `pg_catalog`, not `information_schema`
- Public links resolve by slug, legacy imported Convex ID, or UUID through the legacy-link repository

### Stream Overlay (single-cat-stream)

- `cat_stream_sessions.currentCommand` payloads must be params-only (slug + cat params, never rendered images) — the overlay re-renders sprites locally
- Generation + persistence happen on the control page (authed); the overlay (`?key=<apiKey>`) only renders
- `attachViewSlug`-style patches that don't bump `seq` are ignored by the overlay's dispatch guard (`components/stream-control/obs/commandPolicy.ts`)

### Sprite Assets

- Cat sprites are under `public/assets/`
- Sprites from ClanGen (CC BY-NC 4.0 licensed)
- Do not use sprites for commercial purposes

## Environment Variables

Required for development:
- `DATABASE_URL` - from `pnpm run db:local up` (`.env.database.local`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` - Clerk

Optional:
- `NEXT_PUBLIC_POSTHOG_KEY` - Analytics
- `NEXT_PUBLIC_POSTHOG_HOST` - Analytics host
- `RENDERER_INTERNAL_URL` - Cat card renderer service
- `MAINTENANCE_MODE=1` - Reject writes with 503 during maintenance
- `JOBS_ENABLED=0` - Do not start the job worker in this process

## Testing

```bash
pnpm run test            # Run tests (vitest)
pnpm run test -- --watch # Watch mode
pnpm run test:db         # PostgreSQL tests
```

### Palette System

- Palette types are centralized in `lib/palettes/types.ts` — `PaletteId`, `PaletteMode`, `PaletteCategory`
- `PaletteCategory.id` is typed as `PaletteId` (not `string`) for compile-time safety
- Adding a new palette: create file, add to `pure/index.ts` or `index.ts`, add ID to `PaletteId` union in `types.ts`
- Never duplicate `PaletteMode` type — always import from `@/lib/palettes`

## Ports

Ports are managed by portless — check dev server output or `/home/beasty/projects/.ports` for registered defaults.

## Important Files

- `app/layout.tsx` - Root layout with providers (rendered per request so runtime env such as `MAINTENANCE_MODE` is read live)
- `server/db/schema/` - Database schema definition
- `components/common/PageHero.tsx` - Standard page header
- `proxy.ts` - Clerk middleware, maintenance gate and entry point routing for the multi-subdomain setup

## Server-Side Patterns

- **Server-side canvas**: Use `@napi-rs/canvas` (already a dependency) for image generation in API routes
- **SSRF protection**: For user-provided image URLs, use `downloadPublicImage` in `lib/public-image-download.ts`. It validates all resolved addresses with `assertPublicAddresses`, pins the connection, and revalidates redirects.
- **Standalone Docker path resolution**: `process.cwd()` may not point to the Next.js dir in standalone builds — use `NEXT_PUBLIC_DIR` env var as fallback
- **Clerk JWT template**: the Quick Share clients request `getToken({ template: "convex" })` and the control plane verifies `aud: "convex"`. The name is historical; renaming it needs a Clerk dashboard change.
