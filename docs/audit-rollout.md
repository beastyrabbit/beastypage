# User search index rollout

The `users.usernameSearch` field and `byUsernameSearch` index are written for
all new and edited users. Existing user documents need a one-time bounded
backfill before username prefix search is enabled. A six-hour Convex cron
automatically starts or resumes that backfill after rollout, so no manual
operator action is required. Operators can run the mutation below to start it
immediately or accelerate the first pass:

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
Current browser pages use an in-memory page identity, so two tabs do not
replace each other's pending matchup. Requests with an ID receive a stored,
expiring matchup capability. Votes may omit the new token during the bridge,
but the server still requires the stored client ID, exact current pair, expiry,
and unused state. New clients send the token. Anonymous requests do not create
unreachable stored matchups. Active persisted capabilities are capped at 600;
expired rows are removed by the hourly bounded cleanup.

The matchup capability table still depends on the configured Convex mutation
boundary for request admission. The active-row cap prevents unbounded storage
growth from fresh IDs, while an edge/IP rate limit or signed stateless
capability rollout would provide stronger abuse control before higher-volume
anonymous traffic is enabled. Do not add a first-caller ownership rule,
because it would let an attacker claim another client's identifier. Monitor
table growth and cleanup lag.

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

# Catdex upload rollout

The `/api/storage/getUploadUrl` Convex HTTP route remains as a compatibility
bridge for older Catdex bundles. It issues the managed `/catdex/upload` URL and
therefore creates the same short-lived reservation as the current mutation.
Legacy `catdex.create` calls may omit `uploadToken` only when the storage ID is
attached to one of those valid reservations. Remove the bridge and make the
token required after all old bundles have been replaced.

Anonymous current bundles send a stable browser client key for upload
reservations. Authenticated users are keyed by their Convex identity. Each key
has a bounded hourly reservation budget. Legacy callers and clients that cannot
persist a key share a separate 60/hour fallback bucket, and all callers remain
behind a 600/hour global backstop.
