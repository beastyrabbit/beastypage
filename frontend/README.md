# Cat Gacha Frontend

Next.js app that powers the Catdex, history tools, and collection gallery.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+
- [Convex CLI](https://docs.convex.dev/quickstart)

## Local setup

Use the [root setup guide](../README.md) for the full stack and secret configuration.
The normal stack uses the configured Convex development deployment. It does not start a local database.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run dev
```

This starts Next.js through Portless. Use the URL printed in the terminal.
The renderer runs separately through the root `pnpm dev` or `pnpm dev:renderer` command.
`pnpm run convex:dev` synchronizes functions to the selected Convex deployment and requires authentication.

| Command | Description |
| ------- | ----------- |
| `pnpm run dev` | Start Next.js through Portless. |
| `pnpm run typecheck` | Generate local version metadata and check TypeScript, without network access. |
| `pnpm run lint` | Check the configured first-party lint scope. |
| `pnpm exec vitest run --project unit` | Unit tests without a renderer or Python dependency. |
| `pnpm exec vitest run --project renderer` | Start one owned renderer on an ephemeral port, verify its contract, test, and await shutdown. |
| `pnpm run build` | Generate local metadata and build Next.js. Does not deploy Convex. |

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
