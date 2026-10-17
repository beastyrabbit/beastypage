# Stream migration area

The PostgreSQL stream slice is active only when `DATA_BACKEND=postgres`; the
Convex functions remain the default path.

| Convex function family | PostgreSQL mapping |
| --- | --- |
| `catStream.getSession`, `getSessionByApiKey` | `server/services/catStream.ts`; `GET /api/cat-stream` (the overlay uses `?key=`) |
| `catStream.ensureSession`, settings and overlay command mutations | `server/services/catStream.ts`; `POST /api/cat-stream` with the operation name |
| Batch stage, marks, highlights, cull verdict and evolution clock functions | `server/services/catStream.ts`; delayed jobs `cat-stream.finalize-batch-cull` and `cat-stream.auto-release-evolution` |
| `streamSessionsV2.list/get/getForHost/create/update` | `server/services/stream.ts`; `/api/stream/sessions` and `/api/stream/sessions/[id]` |
| `streamParticipantsV2.list/get/create/update` | `server/services/stream.ts`; `/api/stream/participants` |
| `streamVotesV2.list/create` | `server/services/stream.ts`; `/api/stream/votes` and the compatibility alias `/api/stream-votes` |
| `streamWheel` | `server/services/catStream.ts`; `/api/stream-wheel` and `wheel_spins` logging |
| `streamAccess.requireHost/listLimit` | Identity and bounded list checks in `server/services/stream.ts` |
| Reactive reads | `stream/<session-id>` and `cat-stream/<session-id>` SSE topics, authorized with Clerk host, viewer key, or overlay API key respectively |

Every session, participant, vote, and overlay write updates the owning
aggregate revision, records a live event, and publishes its topic in the same
transaction. Viewer votes lock the session row in a serializable transaction,
so a participant can record at most one vote in a round under races. Delayed
jobs carry the sequence, verdict timestamp, or hold timestamp and become
no-ops when the session has moved on or the action was cancelled.

Overlay commands remain params-only and preserve the Convex `seq` dispatch
guard. Rendered images are never stored in `current_command`.
