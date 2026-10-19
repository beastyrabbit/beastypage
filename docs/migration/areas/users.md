# Users, variants and Discord

The users slice is served by the following routes, services, and repositories.

| Feature or operation | Current implementation |
| --- | --- |
| Viewer, user creation, profile, and API key | `GET /api/users/viewer`, `POST /api/users/ensure`, `PATCH /api/users/profile`, and `POST /api/users/api-key`; `viewer`, `getOrCreateUser`, `updateProfile`, and `regenerateApiKey` in `frontend/server/services/users.ts` |
| API-key lookup for server consumers | `getUserByApiKey` in `frontend/server/repositories/users.ts`; `findUserByApiKey` in `frontend/server/services/users.ts` is used by service callers |
| Username search and resolution | `GET /api/users/search` and `GET /api/users/resolve`; `searchByUsername` and `resolveUsernames` |
| Reset saved variants | `POST /api/users/reset-variants`; `resetSavedVariants` |
| List user variants | `GET /api/user-variants`; `list` in `frontend/server/services/userVariants.ts` |
| Create, remove, rename, activate, or import variants | `POST /api/user-variants` with `operation` set to `upsert`, `remove`, `rename`, `setActive`, or `importBatch`; matching functions in `userVariants.ts` |
| Discord challenge issue and redemption | `POST /api/discord/challenge`; `issueChallenge` and `redeemChallenge` in `frontend/server/services/discord.ts` |
| Discord user configuration | `GET` and `PATCH /api/discord/user-config`; `getUserConfig` and `updateUserConfig` |

The generated `username_search` column stays synchronized on username writes.
The recurring `discord.challenge-prune` job removes expired challenges. Discord
routes keep the bot bearer-token contract and compare the token in constant
time. Palette and random-cat Discord routes are documented with their other
area.

Services keep authorization, validation, and transaction boundaries. Drizzle
reads and writes are in the users, userVariants, and Discord repositories.
Username uniqueness is case-sensitive, while prefix search follows the
generated lowercase `username_search` index order. First sign-in loads the
Clerk profile only on the create path, derives a sanitized username, and adds
a short collision suffix when needed. A profile lookup failure creates an
unnamed user.

Challenge issue and redemption are anonymous-capable and have a five-minute
expiry. Malformed or wrong answers consume the challenge and return a
replacement. Configuration updates validate numeric fields, deduplicate
repeated palette additions, and remove palettes idempotently.

