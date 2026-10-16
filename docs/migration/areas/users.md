# Users, variants and Discord

With `DATA_BACKEND=postgres`, the users slice is served by the following
routes and services. The Convex implementation remains the default path.

| Convex function | PostgreSQL mapping |
| --- | --- |
| `users.viewer` | `GET /api/users/viewer` → `services/users.viewer` |
| `users.getOrCreateUser` | `POST /api/users/ensure` → `services/users.getOrCreateUser` |
| `users.updateProfile` | `PATCH /api/users/profile` → `services/users.updateProfile` |
| `users.regenerateApiKey` | `POST /api/users/api-key` → `services/users.regenerateApiKey` |
| `users.getUserByApiKey` | `repositories/users.getUserByApiKey` (server consumers) |
| `users.searchByUsername` | `GET /api/users/search` → `services/users.searchByUsername` |
| `users.resolveUsernames` | `GET /api/users/resolve` → `services/users.resolveUsernames` |
| `users.resetSavedVariants` | `POST /api/users/reset-variants` |
| `userVariants.list/listAll` | `GET /api/user-variants` |
| `userVariants.upsert/remove/rename/setActive/importBatch` | `POST /api/user-variants` with `operation` |
| `discord.issueChallenge/redeemChallenge` | `POST /api/discord/challenge` |
| `discordUserConfigInternal.get` | `GET /api/discord/user-config` |
| `discordUserConfigInternal.upsert/reset/addPalette/removePalette` | `PATCH /api/discord/user-config` |

The retired username backfill is represented by the generated PostgreSQL
`username_search` column; every username write therefore stays synchronized.
Expired challenges are cleaned by the `discord.challenge-prune` job kind.
Discord routes retain the bot bearer-token contract and compare it in constant
time in both backends. Palette and random-cat Discord
routes belong to the other migration slice.

The PostgreSQL services keep authorization, validation and transaction
boundaries; all Drizzle reads and writes are in the users, userVariants and
Discord repositories.

Username uniqueness is case-sensitive, while prefix search follows the
generated lowercase `username_search` index order. First sign-in derives a
sanitized username from the Clerk nickname, name or email claim and appends a
short collision suffix when needed.

`discord.issueChallenge` and `discord.redeemChallenge` are public Convex
mutations: Convex does not require a Clerk identity and has no per-caller
rate limit. PostgreSQL keeps both operations anonymous-capable and applies no
new rate limit; expiry remains five minutes, malformed/wrong answers consume
the challenge and return a replacement, and the recovery job deletes expired
rows.

The Discord config mutations likewise have no backend numeric range or palette
count limit in Convex. The bot's slash-command UI presents 0–4 controls, while
the backend preserves any validated numeric value, deduplicates repeated
palette additions, and removes palettes idempotently.

