# Quick Share

Quick Share keeps media bytes in the media service's S3 bucket. PostgreSQL
stores the control plane metadata, upload parts, worker queue, usage windows
and moderation bans. The PostgreSQL implementation is selected only when
`DATA_BACKEND=postgres`; the existing Convex implementation remains the
default.

## Mapping

| Convex operation | PostgreSQL implementation |
| --- | --- |
| `quickShare.createUpload` | `server/services/quickShare.createUpload` and `quick_share_uploads` |
| `getUpload`, `getPublicUpload`, `getPublicCollection`, `accountUploads` | `handleQuickShareOperation` read operations and repository queries |
| `recordPart`, `markComplete`, `finishImport`, `failImport`, `extendUpload` | Service state transitions and `quick_share_parts` / `quick_share_usage` |
| `claimJob`, `finishProcessJob`, `finishDeleteJob` | Media worker action operations and `quick_share_jobs` |
| `adminList`, `adminGet`, `banIp`, `unbanIp`, `removeUpload` | Admin action operations, with the configured token-identifier allowlist |
| `revokeIpBatch` | `quick-share.revoke-ip` job |
| `recoverJobLease` | `quick-share.recover-lease` job |
| `queueRetentionDeletes` | `quick-share.queue-retention` job |
| `redispatchPendingJobs` | `quick-share.redispatch` job |
| `maintenance` / `quick-share-retention` | recurring `quick-share.retention` job |
| `quickShareHttp.dispatchJob` | `quick-share.dispatch` job; retries use the same 1s, 5s, 15s, 60s, 5m, 15m and 30m delays |

The internal action protocol is exposed at `POST /api/internal/quick-share`.
It accepts the same `{ op, ...payload }` body, checks
`QUICK_SHARE_INTERNAL_TOKEN` with a constant-time comparison, and preserves
the Convex response shapes and status codes. The route returns 404 while
`DATA_BACKEND` is not `postgres`.

The media service has a `CONTROL_PLANE_URL` setting. It is the full internal
endpoint URL and defaults to `${CONVEX_SITE_URL}/quick-share/internal`, so the
cutover does not require a media image change.

## Concurrency and limits

Upload admission runs in a serializable transaction with bounded retries for
serialization failures. Active uploads and each hourly/daily usage row are
locked before they are checked and updated. Upload, part and job state checks
are performed in the same transaction as their transition. Job IDs remain
opaque UUID strings at the media boundary.

## Cutover order

1. Deploy the media service with `CONTROL_PLANE_URL` set to the PostgreSQL
   frontend route while leaving `DATA_BACKEND=convex`; verify no traffic is
   sent to the new route yet.
2. Import Quick Share metadata and open usage windows, return leased jobs to
   pending, and run the S3 verification script.
3. Start the frontend job worker and verify a fake media endpoint accepts
   dispatches, retries and lease recovery.
4. Set `DATA_BACKEND=postgres` on the frontend and perform create, multipart,
   public-read, account and admin smoke checks.
5. Drain old Convex/media workers, take the final backup, then lift the
   maintenance gate. PostgreSQL is the write source after this point; Convex
   is not written again.
