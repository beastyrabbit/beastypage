# BeastyPage Frontend - Development Context

This is a Next.js 16 application with React 19, using Convex as the backend database.

## Project Overview

A pixel cat gacha platform featuring:
- Cat generators with ClanGen sprites
- Gacha wheels and adoption mechanics
- Catdex (Pokedex-style cat browser)
- Stream tools for audience interaction

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, TailwindCSS, Radix UI primitives
- **Database**: Convex (serverless)
- **Package Manager**: Bun
- **Analytics**: PostHog (optional)

## Directory Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── gatcha/             # Main gacha landing
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
├── convex/                 # Convex backend functions
│   ├── schema.ts           # Database schema
│   ├── cats.ts             # Cat-related queries/mutations
│   └── ...
├── lib/                    # Utilities and helpers
└── public/                 # Static assets (sprites, images)
```

## Development Commands

```bash
# Use Bun for all package management
bun install              # Install dependencies
bun run dev              # Start dev server (port 3000)
bun run build            # Production build
bun run lint             # ESLint check
bun run typecheck        # TypeScript check

# Convex
bunx convex dev          # Start Convex dev server
bunx convex deploy       # Deploy to production
```

## Key Conventions

### Bun Over Node.js

- Use `bun <file>` instead of `node <file>`
- Use `bun test` for testing
- Use `bun install` (not npm/yarn/pnpm)
- Bun auto-loads `.env` files (no dotenv needed)

### Component Patterns

- Page components in `app/*/page.tsx`
- Shared UI in `components/common/`
- Use TailwindCSS for styling
- Radix primitives wrapped in `components/ui/`

### Convex Patterns

- Schema defined in `convex/schema.ts`
- Queries are read-only, use `query()`
- Mutations modify data, use `mutation()`
- Actions for external API calls, use `action()`
- Use `useQuery()` and `useMutation()` hooks in components

### Sprite Assets

- Cat sprites are under `public/assets/`
- Sprites from ClanGen (CC BY-NC 4.0 licensed)
- Do not use sprites for commercial purposes

## Environment Variables

Required for development:
- `CONVEX_DEPLOYMENT` - Convex deployment ID
- `NEXT_PUBLIC_CONVEX_URL` - Convex cloud URL

Optional:
- `NEXT_PUBLIC_POSTHOG_KEY` - Analytics
- `NEXT_PUBLIC_POSTHOG_HOST` - Analytics host
- `RENDERER_INTERNAL_URL` - Cat card renderer service

## Testing

```bash
bun test                 # Run tests
bun test --watch         # Watch mode
```

### Palette System

- Palette types are centralized in `lib/palettes/types.ts` — `PaletteId`, `PaletteMode`, `PaletteCategory`
- `PaletteCategory.id` is typed as `PaletteId` (not `string`) for compile-time safety
- Adding a new palette: create file, add to `pure/index.ts` or `index.ts`, add ID to `PaletteId` union in `types.ts`
- Never duplicate `PaletteMode` type — always import from `@/lib/palettes`

## Important Files

- `app/layout.tsx` - Root layout with providers
- `convex/schema.ts` - Database schema definition
- `components/common/PageHero.tsx` - Standard page header
- `middleware.ts` - Entry point routing for multi-subdomain setup
