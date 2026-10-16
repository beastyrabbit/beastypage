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
| `users.resolveUsernames` | `services/users.resolveUsernames` (route can be added by callers) |
| `users.resetSavedVariants` | `POST /api/users/reset-variants` |
| `userVariants.list/listAll` | `GET /api/user-variants` |
| `userVariants.upsert/remove/rename/setActive/importBatch` | `POST /api/user-variants` with `operation` |
| `discord.issueChallenge/redeemChallenge` | `POST /api/discord/challenge` |
| `discordUserConfigInternal.get` | `GET /api/discord/user-config` |
| `discordUserConfigInternal.upsert/reset/addPalette/removePalette` | `PATCH /api/discord/user-config` |

The retired username backfill is represented by the generated PostgreSQL
`username_search` column; every username write therefore stays synchronized.
Expired challenges are cleaned by the `discord.challenge-prune` job kind.
Discord routes retain the bot bearer-token contract and compare it with
`crypto.timingSafeEqual` in PostgreSQL mode. Palette and random-cat Discord
routes belong to the other migration slice.

