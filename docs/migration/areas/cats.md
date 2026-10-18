# Cats and sharing

This slice is dual-path. Convex remains the default; `DATA_BACKEND=postgres`
uses the services and routes below. PostgreSQL rows retain the imported Convex
ID in `legacy_id`, so slug-or-ID links continue to resolve.

| Convex function | PostgreSQL implementation |
| --- | --- |
| `mapper.create`, `get`, `getBySlug`, `updateMeta`, `listHistory`, `listForPreview` | `server/services/cats.ts` (authorization/transactions) + `server/repositories/cats.ts` (SQL); `/api/cats/profile`, `/api/cats/history`, `/api/cats/preview-list` |
| `mapper.getPreviewRefs`, `applyPreviewUpdates` | `server/services/cats.ts` + `server/repositories/cats.ts`; `/api/cats/previews` |
| `adoptionV2.createBatch`, `getBySlug`, `listBatches`, `updateBatchMeta` | `server/services/adoption.ts` + `server/repositories/adoption.ts`; `/api/adoption/batch`, `/api/adoption/batches` |
| `ancestryTree.save`, `saveAsNew`, `checkSlug`, `getBySlug`, `list`, `update`, `remove` | `server/services/ancestry.ts` + `server/repositories/ancestry.ts`; `/api/ancestry/tree`, `/api/ancestry/check-slug`, `/api/ancestry/trees` |
| `catShares.create`, `get` | `server/services/cat-shares.ts` + `server/repositories/catShares.ts`; `/api/cat-share` |
| `previews.upsertMapperPreviews` | `server/services/previews.ts`; `/api/cats/previews` |
| `paletteGeneratorSettingsActions.storeDiscordImage` | `server/services/palette.ts` + `server/repositories/palette.ts`; `/api/discord/palette`, `/api/palette-generator-settings/image` |

Preview and Discord images are content-addressed in `files` through
`server/services/cat-files.ts` and referenced by `cat_images` or
`palette_generator_settings.image_file_id`. They are served by the existing
`/api/files/[id]` route.

Ancestry passwords preserve Convex's `pbkdf2$iterations$salt$hash` format
(PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt, 32-byte key) and the
legacy UTF-16 simple hash verifier for imported trees.

No Convex scheduler calls exist in these modules, so no job kind is required
for this slice.

All owned routes validate query strings and JSON bodies with the shared zod
request parsers. Contract schemas enforce the Convex limits: 900 KiB profile,
adoption, and ancestry payloads; 256 KiB cat shares; 500 ancestry cats and 200
adoption cats; bounded image metadata and 16 MiB raster files. SQL is kept out
of services. Repositories accept the transaction supplied by a service and
return rows; services perform identity, owner/edit-token, password, and admin
token checks. Pagination routes use created-at/id keyset cursors.

The parity suite covers each app-used operation, anonymous and non-owner
denials, edit-token and password failures, malformed payloads, size limits,
slug collisions, preview-token failures, and pagination boundaries. Route tests
exercise PostgreSQL success and invalid/denied paths, the ConvexHttpClient
branches, and server rendering of the Warrior Cats ancestry page.
