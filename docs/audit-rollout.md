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

# Cross-service capability rollout

The Discord palette action accepts an optional `serviceToken` during the
bridge window so older frontend replicas continue to pass Convex argument
validation. The action still rejects calls without the token, and the current
route sends the shared service credential. Deploy the route and matching
Convex environment before removing the optional validator in a later cleanup.

Perfect Cat matchup requests keep `clientId` optional for existing clients.
Requests with an ID receive a stored, expiring matchup capability. Votes may
omit the new token during the bridge, but the server still requires the stored
client ID, exact current pair, expiry, and unused state. New clients send the
token. Anonymous requests do not create unreachable stored matchups.
