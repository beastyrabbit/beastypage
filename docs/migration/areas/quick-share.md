# Quick Share

Quick Share keeps media bytes in the media service's S3 bucket. PostgreSQL
stores control-plane metadata, upload parts, the worker queue, usage windows,
and moderation bans.

Public collections select the newest eligible rows up to
`QUICK_SHARE_POLICY.collectionMaxItems` and return that window oldest to newest.
Rows without all required public media fields are excluded by the repository.

## Operations

The internal protocol is exposed at `POST /api/internal/quick-share`. The body
contains `{ op, ...payload }`. The route checks
`QUICK_SHARE_INTERNAL_TOKEN` with a constant-time comparison and dispatches to
`handleQuickShareOperation` in `frontend/server/services/quickShare.ts`.
Supported operations are `policy`, `create`, `getUpload`, `recordPart`,
`complete`, `finishImport`, `failImport`, `public`, `publicCollection`,
`accountList`, `extend`, `claimJob`, `finishProcess`, `finishDelete`,
`adminList`, `adminGet`, `adminBan`, `adminUnban`, and `adminRemove`.

The media service calls this route through its required `CONTROL_PLANE_URL`.
The value is the complete endpoint URL. The media configuration has no fallback
URL.

## Jobs and limits

`quick-share.dispatch` sends media jobs to the worker and retries at 1 second,
5 seconds, 15 seconds, 60 seconds, 5 minutes, 15 minutes, and 30 minutes.
`quick-share.recover-lease` recovers a media lease,
`quick-share.revoke-ip` applies an IP ban, `quick-share.queue-retention`
queues expired deletes, and `quick-share.redispatch` sends pending jobs again.
The recurring `quick-share.retention` job runs hourly and calls
`maintainQuickShare`.

Upload admission runs in a serializable transaction with bounded retries for
serialization failures. Active uploads and hourly and daily usage rows are
locked before they are checked and updated. Upload, part, and job state checks
run in the same transaction as their state transition. Media job IDs remain
opaque UUID strings at the service boundary.
