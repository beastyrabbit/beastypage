# Target data contract (Convex → PostgreSQL)

> [!NOTE]
> This procedure was completed on 2026-10-18 and is kept as the historical
> record.

This contract covers issues #107 (types for `v.any()` fields) and #109
(table model).

| Part | Source of truth |
| --- | --- |
| Table definitions | `frontend/server/db/schema/*.ts` |
| JSON column contracts | `frontend/server/db/contracts.ts` (zod; the importer and the server data layer both use it) |
| First migration | `frontend/drizzle/0000_init.sql` |
| Classes and import rules | [ADR 0001 §6](adr-0001-postgresql.md#6-table-classes) |

## Rules for every table

- **IDs.** Every table has `id uuid primary key default gen_random_uuid()`.
  Imported rows get `uuidv5(ns, "<table>:<convex _id>")` instead (ADR §5).
- **Legacy columns.** Every imported table has `legacy_id text unique`
  (the Convex `_id`) and `legacy_created_at timestamptz` (from
  `_creationTime`). The one exception is `adoption_batch_cats`: its rows were
  array elements and have no Convex ID.
- **Timestamps.** Convex number fields that hold epoch milliseconds
  (`createdAt`, `expiresAt`, and so on) become `timestamptz` at microsecond
  precision, so no millisecond is lost. `_creationTime` has fractional
  milliseconds and is rounded to the microsecond.
  - The importer rejects a value that is not a finite number between
    2000-01-01 and 2100-01-01.
  - Columns that held a duration (`chargeDurationMs`, `verdictAt` inside
    JSON) keep their number form inside JSON.
- **Optional vs null.** A Convex optional field that is absent becomes SQL
  `NULL`. Inside JSON payloads, absent and `null` are both allowed for known
  optional keys, because readers use `??`.
- **Case.** Slugs, tokens and keys compare case-sensitively, as in Convex.
  Username search uses the generated lower-case `username_search`.
- **Uniqueness.** Every lookup where the Convex code called `.unique()`, or
  checked "already exists" before inserting, is now a `UNIQUE` constraint.
  A historical duplicate is quarantined and reported, never merged silently.
- **Indexes.** Every Convex index has a PostgreSQL index with the same
  columns. The exceptions are noted per table. Convex appends `_creationTime`
  to every index implicitly; where code depended on that ordering, the
  PostgreSQL index ends in `created_at`.
- **Unknown JSON keys.** Kept, but only as JSON values (see
  `contracts.ts`). Known keys are type-checked; NaN, Infinity and non-JSON
  values are rejected.

## JSON contracts for the 22 `v.any()` fields

| Convex field | Target | Contract | Choice |
| --- | --- | --- | --- |
| `evolutionCommandValidator.cats[].additions` | `cat_stream_sessions.current_command` | `evolutionCommand` | typed JSONB; replaced as a unit on every command |
| `evolutionCommandValidator.cats[].catData` | same | `catData` | typed JSONB |
| `batchCommandValidator.cats[].catData` | same | `catData` | typed JSONB |
| `cat_profile.catData` | `cat_profile.cat_data` | `catProfileData` (900 KiB) | typed JSONB; nine producer shapes share one envelope |
| `cat_images.meta` | `cat_images.meta` | `catImageMeta` (64 KiB JSON) | JSONB; nothing reads it, candidate for removal |
| `cat_shares.data` | `cat_shares.data` | `catShareData` (v1 or v2, 256 KiB) | typed JSONB |
| `single_cat_settings.config` | `.config` | `singleCatConfig` (256 KiB) | typed JSONB |
| `adoption_batch.settings` | `.settings` | `adoptionBatchSettingsShape` | typed JSONB; `starter.profileId` rewritten |
| `adoption_batch.cats[].catData` | `adoption_batch_cats.cat_data` | `catData` | **child table** (FK to `cat_profile`) |
| `stream_sessions.stepHistory` | `.step_history` | `streamStepHistory` | typed JSONB; bounded by the step count |
| `stream_sessions.params` | `.params` | `streamParams` (900 KiB) | typed JSONB |
| `stream_votes.optionMeta` | `.option_meta` | `streamVoteOptionMeta` (strict) | typed JSONB; `participantId` rewritten |
| `perfect_cats.params` | `.params` | `perfectCatParams` (32 KiB) | typed JSONB, stored verbatim (feeds the dedupe hash) |
| `palette_generator_settings.config` | `.config` + **`image_file_id`** | `paletteGeneratorConfig` | typed JSONB; nested `imageStorageId` becomes an FK column |
| `pixelator_settings.config` | `.config` | `pixelatorConfig` | typed JSONB |
| `dash_settings.config` | `.config` | `dashConfig` | typed JSONB |
| `ancestry_tree.cats[].params` | `ancestry_tree.cats` | `ancestryCats` (500 cats, 900 KiB) | typed JSONB; the tree is written as one document and uses tree-local IDs |
| `ancestry_tree.cats[].genetics` | same | `catGenetics` | typed JSONB |
| `cat_stream_sessions.settings` | `.settings` | `catStreamSettings` (256 KiB) | typed JSONB |
| `cat_stream_sessions.currentCommand.params` | `.current_command` | `catStreamCommand` (1 MB) | typed JSONB |
| `cat_stream_sessions.currentCommand.slots` | same | `slotSelections` | typed JSONB |
| `user_variants.settings` | `.settings` | `userVariantSettingsByTool[tool_key]` | typed JSONB, checked against `tool_key`; unknown tool keys are quarantined |

The importer writes a versioned validation report (`CONTRACT_VERSION`). For
each field it counts records that are valid, repaired, quarantined or
rejected. The only repairs are the ID rewrites and moving `imageStorageId`
into its column. **The 22 fields were proven against real data when the #106
export was validated.**

Known test-fixture issue: `convex/review-boundaries.test.ts` and
`convex/catStream.test.ts` write `catData: {}`. That passes, because every
key is optional.

## Tables

Key:

- **D** durable product data
- **S** live session state
- **C** short-lived capability
- **Q** queue or work
- **W** counter or window
- **B** bookkeeping

Unless noted, created/updated timestamps are `NOT NULL DEFAULT now()`.

| Table | Class | Unique | Foreign keys (on delete) | Embedded refs rewritten | Sensitive columns |
| --- | --- | --- | --- | --- | --- |
| `card_season` | D | — | `card_back_file_id → files` (restrict) | — | — |
| `rarity` | D | — | — | — | — |
| `catdex` | D | — | `season_id → card_season`, `rarity_id → rarity` (restrict); four `*_file_id → files` (restrict) | — | `twitch_user_name` (public by design) |
| `catdex_uploads` | C | `token` | `file_id → files` (restrict) | — | `token`, `rate_key` |
| `collection` | D | — | three `*_file_id → files` (restrict) | — | — |
| `coinflipper_scores` | D | — | — | — | — |
| `cat_profile` | D | `slug` | `adoption_batch_id → adoption_batch` (set null) | `cat_data.shareSlug` (slug, unchanged) | `edit_token`, `owner_token_identifier` |
| `cat_images` | D | — | `cat_profile_id → cat_profile` (cascade), `file_id → files` (restrict) | — | — |
| `cat_shares` | D | `slug` | — | — | `edit_token`, `owner_token_identifier` |
| `single_cat_settings` | D | `slug` | — | — | `edit_token`, `owner_token_identifier` |
| `adoption_batch` | D | `slug` (nullable) | — | `settings.starter.profileId` | `edit_token`, `owner_token_identifier` |
| `adoption_batch_cats` | D (new) | `(batch_id, position)` | `batch_id → adoption_batch` (cascade), `profile_id → cat_profile` (set null) | — | `edit_token`, `share_token` |
| `stream_sessions` | S | `viewer_key` | — | `params._finalShareSlug` (slug, unchanged) | `viewer_key`, `owner_token_identifier` |
| `stream_participants` | S | — | `session_id → stream_sessions` (cascade) | — | `fingerprint`, `viewer_session` |
| `stream_votes` | S | — | `session_id` (cascade), `voted_by → stream_participants` (set null) | `option_meta.participantId` | — |
| `wheel_spins` | D | — | — | — | `actor_key` |
| `discord_challenge` | C | `token` | — | — | `answer_hash`, `salt`, `token` |
| `perfect_cats` | D | `hash` | — | — | — |
| `perfect_votes` | D | — | `cat_a_id`, `cat_b_id`, `winner_id → perfect_cats` (restrict) | — | `client_id` |
| `perfect_matchups` | C | — | `cat_a_id`, `cat_b_id → perfect_cats` (cascade) | — | `token`, `client_id` |
| `palette_generator_settings` | D | `slug` | `image_file_id → files` (restrict) | `config.imageStorageId` → `image_file_id` | `edit_token`, `owner_token_identifier` |
| `pixelator_settings` | D | `slug` | — | — | `edit_token`, `owner_token_identifier` |
| `dash_settings` | D | `slug` | — | — | `edit_token`, `owner_token_identifier` |
| `discord_user_configs` | D | `discord_user_id` | — | — | `discord_user_id` |
| `ancestry_tree` | D | `slug` | — | `cats[].historyProfileId` (cat_profile ID) | `edit_token`, `password_hash`, `owner_token_identifier` |
| `users` | D | `token_identifier`, `username`, `api_key` | — | — | `token_identifier` (Clerk), `api_key` |
| `user_search_migrations` | B | — | — | — | **not imported**; `username_search` is a generated column |
| `cat_stream_sessions` | D + S | `user_id` | `user_id → users` (cascade) | — | — |
| `user_variants` | D | `(user_id, tool_key, variant_id)` | `user_id → users` (cascade) | — | — |
| `quick_share_uploads` | D | — (collection items share one `slug`) | — | — | `raw_ip`, `ip_hash`, `receipt_hash`, `rate_identity`, `owner_token_identifier` |
| `quick_share_parts` | Q | `(upload_id, part_number)` | `upload_id → quick_share_uploads` (cascade) | — | — |
| `quick_share_jobs` | Q | `(upload_id, kind)` | `upload_id` (cascade) | job IDs in media URLs | `lease_id` |
| `quick_share_usage` | W | `(identity, kind, window_start)` | — | — | `identity` |
| `quick_share_bans` | D | `ip_hash` where `active` | — | — | `ip_hash`, `raw_ip` |

New operational tables: `files`, `live_events`, `jobs`, `job_runs`,
`beastypage_schema_version`, `import_runs` and `import_checkpoints`.

### Per-table notes

- **Arrays kept as arrays.**
  - `stream_sessions.allowed_options` and `discord_user_configs.palettes`
    are `text[]`. They are small and always replaced as a whole.
  - `ancestry_tree.cats` stays JSONB. The Convex validator already typed it,
    the app saves the tree as one document, and its `motherId`, `fatherId`,
    `partnerIds` and `childrenIds` are tree-local string IDs, not Convex IDs.
  - `cat_stream_sessions.batch_state` / `evolution_state` stay JSONB. They
    are replaced atomically on each beat.
- **Array normalized.** `adoption_batch.cats[]` becomes
  `adoption_batch_cats`, because each element can reference a
  `cat_profile`. Order is kept in `position`.
- **Indexes added beyond Convex.**
  - `catdex_created_idx (created_at, id)` for keyset pagination.
  - `adoption_batch_owner_idx` for history listings.
  - `cat_profile_batch_idx` for the new foreign key.
  - The partial `quick_share_bans_active_ip_key`.
- **Integers vs doubles.** Counts, sizes, dimensions, sequence numbers and
  attempts are `integer`/`bigint`, and the importer rejects non-integers.
  `rating`, `chance_percent`, `focus_x`/`focus_y` and `random_bucket` are
  `double precision`.
- **Live revision.** `stream_sessions.revision` and
  `cat_stream_sessions.revision` are new. They start at 0 on import.
- **Durable vs ephemeral import rules.** See ADR §6. For example, expired
  `discord_challenge`, `perfect_matchups` and `catdex_uploads` rows are
  skipped (counted, not quarantined). Leased `quick_share_jobs` go back to
  `pending`.

## Legacy URLs that carry Convex IDs

| URL | Lookup order | Test |
| --- | --- | --- |
| `/view/<slug-or-id>` | `cat_profile.slug`, then `legacy_id`, then `id` | `legacy-links.db.test.ts` |
| `/api/preview/<slug-or-id>` | same | same |
| `/adoption/<slug-or-id>` | `adoption_batch.slug`, then `legacy_id`, then `id` | same |
| Stream host links (`getForHost`) | `stream_sessions.legacy_id`, then `id`, plus the owner check | same |
| Convex storage URLs (`*.convex.cloud/api/storage/<uuid>`) | not preserved: pages build them on every read and no table stores them; images already posted to Discord or elsewhere stop loading once the Convex project is deleted (#117) | — |

## Staging scrub (#112)

Every column marked sensitive above is replaced or removed before data leaves
production:

- Tokens and keys are regenerated randomly.
- Clerk and Discord IDs get deterministic pseudonyms (HMAC with a key that
  never enters the repo or staging).
- `raw_ip` is dropped and `ip_hash` is re-hashed.
- `password_hash` is replaced with a hash of a known staging password.
- Quick Share rows are trimmed to the metadata needed for tests.
