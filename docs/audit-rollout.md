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

The matchup capability table remains a residual availability risk: each
distinct caller-supplied `clientId` can create one expiring row, and the
current hourly bounded cleanup cannot prevent storage growth during a
sustained flood of fresh IDs. Treat this as **high production risk** until an
edge/IP rate limit or a signed stateless capability rollout is in place. Do
not add a first-caller ownership rule, because it would let an attacker claim
another client's identifier. Monitor table growth and cleanup lag before
enabling higher-volume anonymous traffic.

# Legacy settings rows

The anonymous edit capability added to cat shares and tool settings cannot be
backfilled safely. Rows created before this change have neither an
`ownerTokenIdentifier` nor an `editToken`, so they remain readable but are
intentionally read-only. A caller must not be allowed to claim one by being the
first person to submit an update, because that would let anyone take over a
known slug.

Clients that need to change a legacy row should save the settings under a new
slug. New rows return an `editToken`; clients must retain it and send it when
updating an anonymous row. Authenticated rows can be updated by the same
authenticated identity through `ownerTokenIdentifier`.

# Palette image URL rollout

New frontend bundles resolve palette images through the settings slug. The
`paletteGeneratorSettings.getImageUrl` query temporarily accepts both `slug`
and the former `storageId` argument so old bundles remain compatible during a
rolling deployment. Remove the `storageId` fallback after all old frontend
replicas have been replaced and the compatibility window has expired.
