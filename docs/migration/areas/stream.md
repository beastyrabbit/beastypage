# Stream migration area

The stream slice uses PostgreSQL services, repositories, and live topics.

| Feature or operation | Current implementation |
| --- | --- |
| Cat stream session lookup | `getCatStreamSession` and `getCatStreamSessionByApiKey` in `frontend/server/services/catStream.ts`; `GET /api/cat-stream` and `GET /api/cat-stream/[id]` (`?key=` is the API-key lookup) |
| Cat stream session creation, settings, and overlay commands | `ensureCatStreamSession`, the settings and command functions in `frontend/server/services/catStream.ts`, and `POST /api/cat-stream` with an operation field |
| Batch stages, marks, highlights, cull verdicts, and evolution clock | `frontend/server/services/catStream.ts`; delayed jobs `cat-stream.finalize-batch-cull` and `cat-stream.auto-release-evolution` |
| Stream sessions | `frontend/server/services/stream.ts`; `GET` and `POST` or `PATCH /api/stream/sessions`, and `GET /api/stream/sessions/[id]` |
| Stream participants | `listStreamParticipants`, `createStreamParticipant`, and `updateStreamParticipant`; `GET` and `POST` or `PATCH /api/stream/participants` |
| Stream votes | `listStreamVotes` and `createStreamVote`; `GET` and `POST /api/stream/votes`, also exported by `/api/stream-votes` |
| Stream wheel | `triggerCatStreamWheel`; `POST /api/stream-wheel` |
| Live snapshots | `stream/<session-id>` and `cat-stream/<session-id>` topics on `/api/live/[...topic]`, authorized with the stream viewer key or host identity, or the cat-stream API key or owner identity |

Every session, participant, vote, and overlay write updates its aggregate
revision, records a live event, and publishes its topic in the same
transaction. Viewer votes lock the session row in a serializable transaction,
so a participant can record at most one vote in a round under races. Delayed
jobs carry the sequence, verdict timestamp, or hold timestamp and become
no-ops when the session has moved on or the action was cancelled.

Overlay commands remain parameter-only and keep the sequence dispatch guard.
Rendered images are never stored in `current_command`.
