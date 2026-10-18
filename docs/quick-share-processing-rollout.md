# Quick Share processing rollout

## Summary

Quick Share media workers previously polled the PostgreSQL job table every two
seconds even when no work was available. Because every replica ran its own loop,
idle traffic scaled with the replica count. The production fix replaced polling
with event-driven dispatch through the frontend PostgreSQL API.

A transaction inserts the job and publishes one dispatch event. The media worker
receives the specific job ID through the authenticated internal endpoint, claims a
short lease, processes the object, and records completion. Bounded retries, lease
recovery, and an infrequent safety sweep cover failures without continuous
polling.

## Impact and cost amplification

The previous topology had three media replicas. Each replica polled once every
two seconds:

```text
3 replicas × 43,200 poll cycles/day = 129,600 polls/day
129,600 polls × 2 database requests/poll ≈ 259,200 requests/day
```

The lesson is `replicas × polls × downstream calls`: a short polling interval in
a replicated service continues at full rate when the queue is empty.

## Event-driven design

```text
PostgreSQL transaction
  -> insert pending job and publish dispatch event
  -> authenticated media callback(jobId)
  -> point-claim job and create lease
  -> process object
  -> finish or fail job

dispatch failure -> bounded retry after state check
worker crash      -> lease recovery and redispatch
outage            -> bounded pending-job sweep
```

The callback uses the shared internal token and forwarded bearer identity. An
idle worker makes no database requests. The media service receives its required
`CONTROL_PLANE_URL` from runtime configuration and calls the frontend
`/api/internal/quick-share` endpoint.

## Reliability guardrails

- Use a processing lease with a scheduled recovery check.
- Retry failed dispatches with bounded backoff.
- Check job state before every retry so completed work is not repeated.
- Use an infrequent, paginated safety sweep for outages and migrations.
- Keep collection retention and public reads bounded.
- Keep the internal token and database credentials in Infisical; never print them.

The frontend job worker owns the database transaction and dispatch event. The
media service owns object download, validation, derivative generation, and S3
storage. This separation keeps the control plane and processing data contracts
explicit.

## Production rollout

1. Add new callback and job-ID paths while preserving compatibility for one
   rollout where older workers may still be running.
2. Deploy workers that understand event dispatch.
3. Activate event dispatch and stop polling.
4. Verify every legacy worker replica has terminated.
5. Remove the legacy claim shape after the compatibility window.
6. Check PostgreSQL logs using a post-cutover time window and record the window
   with every execution-rate report.

Build each image once, capture its registry digest, and update GitOps only after
the release is approved. Verify the HelmRelease and Kubernetes rollouts before
removing compatibility behavior.

## Local verification

Run the media tests and typecheck, the frontend database tests, and the renderer
workflow-gate test. Run `git diff --check`, Lefthook, and gitleaks before commit.
The CI database job uses an ephemeral PostgreSQL service; production uses the
`beastypage-postgres` CNPG cluster in the `webpage` namespace.
