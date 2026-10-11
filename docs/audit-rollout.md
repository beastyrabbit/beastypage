# User search index rollout

The `users.usernameSearch` field and `byUsernameSearch` index are written for
all new and edited users. Existing user documents need a one-time bounded
backfill before username prefix search is enabled:

```sh
npx convex run users:backfillUsernameSearch '{"batchSize":100}'
```

The internal mutation schedules the next batch until the migration state is
marked complete. During the transition, `searchByUsername` fails closed with a
migration-incomplete error instead of scanning or returning a truncated result.
Exact username resolution uses the existing `byTokenIdentifier` index and does
not require a Clerk ID backfill.
