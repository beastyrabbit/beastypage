# User search index rollout

The `usernameSearch` field and `byUsernameSearch` index are maintained by the
PostgreSQL data layer. Existing users receive a one-time bounded backfill before
prefix search is enabled. The frontend job worker resumes the backfill in bounded
batches and records completion in PostgreSQL. Search fails closed while the
migration is incomplete instead of scanning or returning a truncated result.

Exact username resolution uses the existing token identifier index and does not
require a Clerk ID backfill. Monitor the worker job status route and PostgreSQL
query latency during the rollout.

## Cross-service capability rollout

The Discord palette action accepts an optional service token during a bridge
window so older frontend replicas remain compatible. The action rejects calls
without the token, and the current route sends the shared service credential.
Deploy the route and matching frontend runtime configuration before removing the
optional validator.

Perfect Cat matchup requests keep `clientId` optional for existing clients.
Current browser pages use an in-memory page identity, so two tabs do not replace
each other's pending matchup. Requests receive a stored, expiring matchup
capability and return the generated client ID when none was provided. Votes may
omit the new token during the bridge, but the server still requires the stored
client ID, exact current pair, expiry, and unused state. New clients send the
token. Successful votes delete their capability immediately. Active persisted
capabilities are capped at 600; expired rows are removed by bounded cleanup.

## Legacy settings rows

The anonymous edit capability added to cat shares and tool settings cannot be
backfilled safely. Rows created before this change have neither an
`ownerTokenIdentifier` nor an `editToken`, so they remain readable but are
intentionally read-only. A caller must not be allowed to claim one by being the
first person to submit an update.

Clients that need to change a legacy row should save the settings under a new
slug. New rows return an `editToken`; clients must retain it and send it when
updating an anonymous row. Authenticated rows can be updated by the same
authenticated identity through `ownerTokenIdentifier`.

## Palette image URL rollout

New frontend bundles resolve palette images through the settings slug. The image
route temporarily accepts both `slug` and the former `storageId` argument so old
bundles remain compatible during a rolling deployment. Remove the fallback after
all old frontend replicas have been replaced and the compatibility window has
expired.

## Catdex upload rollout

The upload route issues the managed `/catdex/upload` URL and creates the same
short-lived reservation as the current mutation. Legacy calls may omit
`uploadToken` only when the storage ID is attached to one of those valid
reservations. Remove the bridge and make the token required after all old
bundles have been replaced.

Anonymous current bundles send a stable browser client key for upload
reservations. Authenticated users are keyed by their token identifier. Each key
has a bounded hourly reservation budget. Legacy callers and clients that cannot
persist a key share a separate fallback bucket, and all callers remain behind a
global backstop. Reservations last one hour. Completed submissions leave a
consumed row through that window, so finishing an upload does not replenish the
quota. Cleanup deletes expired unattached blobs and leaves consumed card blobs
intact.

## Pixelator input limits

The proxy accepts approximately 14 MB of JSON, matching the service's hard
10 MiB decoded-image limit plus base64 and JSON overhead. Oversized requests fail
before the proxy buffers and forwards a body the service would reject. The four
million-pixel limit also applies.
