# Cats and sharing

The cats slice uses PostgreSQL services and repositories. Rows imported from
Convex keep their old identifier in `legacy_id`, and the legacy-link helpers
in `frontend/server/repositories/legacyLinks.ts` resolve slug, legacy ID, and
current UUID links.

| Feature or operation | Current implementation |
| --- | --- |
| Cat profile create, lookup, metadata update, history, and preview list | `frontend/server/services/cats.ts` with `frontend/server/repositories/cats.ts`; `/api/cats/profile`, `/api/cats/history`, and `/api/cats/preview-list` |
| Preview references and preview updates | `getPreviewRefs`, `applyPreviewUpdates`, and `frontend/server/services/previews.ts`; `POST /api/cats/previews` |
| Adoption batch create, lookup, list, and metadata update | `frontend/server/services/adoption.ts` with `frontend/server/repositories/adoption.ts`; `/api/adoption/batch` and `/api/adoption/batches` |
| Ancestry tree save, save-as-new, lookup, list, update, remove, and slug check | `frontend/server/services/ancestry.ts` with `frontend/server/repositories/ancestry.ts`; `/api/ancestry/tree`, `/api/ancestry/check-slug`, and `/api/ancestry/trees` |
| Cat share create and lookup | `frontend/server/services/cat-shares.ts` with `frontend/server/repositories/catShares.ts`; `/api/cat-share` |
| Palette record and Discord image storage | `frontend/server/services/palette.ts` with `frontend/server/repositories/palette.ts`; `/api/palette-generator-settings`, `/api/palette-generator-settings/image`, and `/api/discord/palette` |

Preview and Discord images are stored in `files` through
`frontend/server/services/cat-files.ts` and referenced by the image tables.
`GET /api/files/[id]` serves stored bytes.

Ancestry passwords use the `pbkdf2$iterations$salt$hash` format with
PBKDF2-HMAC-SHA256, 100,000 iterations, a 16-byte salt, and a 32-byte key.
Imported trees also use the legacy UTF-16 simple-hash verifier.

Owned routes validate query strings and JSON bodies with the shared request
parsers. Contract schemas enforce the profile, adoption, ancestry, cat-share,
image metadata, and raster-file limits. Services own identity, owner,
edit-token, password, and admin-token checks, while repositories perform SQL
using the transaction supplied by the service. List routes use created-at and
ID keyset cursors.

Route and database tests cover successful reads and writes, anonymous and
non-owner denials, malformed and oversized payloads, slug collisions,
preview-token failures, and pagination boundaries.
