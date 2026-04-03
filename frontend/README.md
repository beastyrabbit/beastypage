# Cat Gacha Frontend

Next.js app that powers the Catdex, history tools, and collection gallery.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+
- [Convex CLI](https://docs.convex.dev/quickstart)

## Local Setup

```bash
cd frontend
pnpm install
pnpm run prepare   # runs `convex codegen`
```

In one terminal start the Convex dev server:

```bash
pnpm run convex:dev
```

In another terminal start the web+renderer stack:

```bash
pnpm run dev
```

The site runs at http://localhost:3000, the renderer service at http://localhost:8001, and Convex at http://localhost:3210.

## Key Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm run dev` | Next.js app + renderer service (via `concurrently`). |
| `pnpm run convex:dev` | Runs Convex dev server locally. |
| `pnpm run lint` | Lint check. |
| `pnpm run build` | Production build (Next.js + Convex bundling). |

## Progressive Media Loading

- `components/common/ProgressiveImage.tsx` streams a blurred thumbnail first, then swaps to the full asset once downloaded.
- Catdex cards use the export's `thumbs_*.png` files; Collection cards use `blur_img` / `preview_img` / `full_img` tiers.

## Folder Overview

- `app/catdex` — Catdex browser with filters, progressive image loading, and detail drawer.
- `app/collection` — Gallery with blurred-placeholder previews and modal viewer.
- `app/guided-builder` — React port of the guided builder wizard powered by the V3 renderer.
- `app/guided-builder/view/[[...slug]]` — Timeline viewer that replays each builder step from a shared link.
- `components/guided-builder/` — Client components for the wizard (state machine, option pickers, timeline viewer).
- `convex/importer.ts` — Convex action + mutation for data imports.
- `convex/rarities.ts` / `convex/seasons.ts` — Helpers for rarity and season defaults.
