# Cats and sharing

This slice is dual-path. Convex remains the default; `DATA_BACKEND=postgres`
uses the services and routes below. PostgreSQL rows retain the imported Convex
ID in `legacy_id`, so slug-or-ID links continue to resolve.

| Convex function | PostgreSQL implementation |
| --- | --- |
| `mapper.create`, `get`, `getBySlug`, `updateMeta`, `listHistory`, `listForPreview` | `server/services/cats.ts`; `/api/cats/profile`, `/api/cats/history`, `/api/cats/preview-list` |
| `mapper.getPreviewRefs`, `applyPreviewUpdates` | `server/services/cats.ts`; `/api/cats/previews` |
| `adoptionV2.createBatch`, `getBySlug`, `listBatches`, `updateBatchMeta` | `server/services/adoption.ts`; `/api/adoption/batch`, `/api/adoption/batches` |
| `ancestryTree.save`, `saveAsNew`, `checkSlug`, `getBySlug`, `list`, `update`, `remove` | `server/services/ancestry.ts`; `/api/ancestry/tree`, `/api/ancestry/check-slug`, `/api/ancestry/trees` |
| `catShares.create`, `get` | `server/services/cat-shares.ts`; `/api/cat-share` |
| `previews.upsertMapperPreviews` | `server/services/previews.ts`; `/api/cats/previews` |
| `paletteGeneratorSettingsActions.storeDiscordImage` | `server/services/palette.ts`; `/api/discord/palette` |

Preview and Discord images are content-addressed in `files` through
`server/services/cat-files.ts` and referenced by `cat_images` or
`palette_generator_settings.image_file_id`. They are served by the existing
`/api/files/[id]` route.

Ancestry passwords preserve Convex's `pbkdf2$iterations$salt$hash` format
(PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt, 32-byte key) and the
legacy UTF-16 simple hash verifier for imported trees.

No Convex scheduler calls exist in these modules, so no job kind is required
for this slice.
