# Quick Share Convex Cost Incident

## Summary

Quick Share media workers polled Convex every two seconds even when no work was
available. Because the polling loop ran independently in every media replica,
idle traffic scaled with the replica count and produced millions of unnecessary
function executions.

The production fix in `v7.1.5` replaced polling with event-driven dispatch. A
mutation now inserts the job and atomically schedules an action, which calls an
authenticated media-worker endpoint with the specific job ID. Leases, bounded
retries, recovery scheduling, and an hourly safety sweep cover failures without
continuous polling.

## Impact and cost amplification

The previous production topology had three media replicas. Each replica polled
once every two seconds:

```text
3 replicas × 43,200 poll cycles/day = 129,600 polls/day
129,600 polls × 2 Convex executions/poll ≈ 259,200 executions/day
```

Each poll crossed the Convex HTTP boundary and then invoked `quickShare:claimJob`,
so one idle poll appeared as roughly two billed executions. The observed 2.7
million executions were consistent with this design running for multiple days.

The important lesson is that a short polling interval in a replicated service is
not one timer. It is `replicas × polls × downstream calls`, and it continues at
full rate when the queue is empty.

## What was wrong in the original design

### Replica-local polling for serverless work

The media service started a `setInterval` loop on every replica. This made idle
cost proportional to the number of pods and used Convex as a queue that had to be
scanned continuously.

Best practice: create work at the same point where application state changes.
In Convex, schedule an internal action from the mutation that inserts the job.
Scheduling from a mutation is atomic with that mutation, so a committed job is
not left without a corresponding dispatch attempt.

### Queue-wide claiming instead of targeted dispatch

Workers asked Convex for any available job. That required a request even when no
job existed and made every replica compete for the same queue.

Best practice: dispatch a concrete `jobId` and claim it with a point lookup.
Validate that the job is pending, or that its lease expired, before changing its
state.

### Reliability was coupled to frequent polling

Polling doubled as crash recovery. Removing it without another recovery path
would have left jobs stranded.

Best practice: make reliability explicit:

- use a processing lease with a scheduled recovery check;
- retry failed dispatches with bounded backoff;
- check job state before every retry so completed work is not repeated;
- use an infrequent, paginated safety sweep for migration and outage recovery.

The steady-state Quick Share safety work is now one hourly maintenance mutation
plus two bounded child mutations, normally about 72 executions per day. The
Catdex thumbnail backfill runs once every six hours. Additional work only occurs
when there are real records to process.

## Event-driven design

```text
enqueue mutation
  -> insert pending job
  -> scheduler.runAfter(0, dispatch action)
  -> authenticated worker callback(jobId)
  -> point-claim job and create lease
  -> process job
  -> finish or fail job

dispatch failure -> bounded retry after state check
worker crash      -> lease recovery and redispatch
outage/migration  -> hourly paginated pending-job sweep
```

The callback uses the existing internal token, compares it in constant time, and
returns `401` without valid authentication. An idle worker makes no Convex calls.

## Mistakes during the remediation and release

### Convex was deployed before legacy workers were gone

The new required `jobId` claim signature reached production while old workers
were still polling without that argument. During the transition, those workers
continued generating requests and received `400` responses. This was temporary,
but it kept producing billed calls until the media rollout completed.

Best practice: use a compatibility-first rollout for cross-service protocol
changes:

1. Add the worker callback and job-ID claim path while keeping the old path
   compatible or feature-gated.
2. Deploy workers that understand push dispatch, initially retaining a safe
   compatibility mode.
3. Activate event dispatch and disable polling.
4. Verify all legacy pods are terminated.
5. Remove the legacy claim shape in a later release.

For an urgent single-release rollout, keep the old claim arguments temporarily
optional and remove them only after Kubernetes reports that every old replica is
gone. A breaking function signature must not be the first production step.

### The release workflow built the same commit twice

Pushing `main` and then `v7.1.5` triggered both the branch and tag paths. This
duplicated frontend and media builds, and the tag workflow also built unchanged
services.

Best practice: build an artifact once, record its digest, and promote that digest
to release aliases. Either make release images tag-only or make the tag workflow
promote the already-tested main artifact instead of rebuilding it.

### A short SHA image tag was treated as immutable

The emergency rollout used the short commit tag `6f147d2` while the release build
was pending. Because two workflows built the same commit, the registry tag was
later overwritten with a different manifest digest. A commit-looking tag is
still mutable unless the registry prevents overwrites.

Best practice: use an OCI digest such as `repository@sha256:...` when immutability
matters. If the Helm values only accept tags, ensure one workflow owns the build
and that tags are never overwritten. Verify the registry digest before changing
GitOps.

### The CI deploy key was assumed to allow environment writes

The Convex CI deploy key could deploy functions but did not have
`deployment:env:write`, so using it to set `QUICK_SHARE_WORKER_URL` returned
`403`. Deploy permission and environment-management permission are distinct.

Best practice: verify the target and permission model before mutation. Use an
authenticated operator session or a dedicated management identity for
environment changes, target the deployment explicitly, and never list or print
secret values. For this project the non-secret URL was set with an explicit
production deployment target rather than the CI deploy key.

### Historical logs were initially mixed with post-rollout logs

The first 1,000-entry production sample still contained the old polling window,
so it showed hundreds of Quick Share calls even after the fix was live. Without
a cutover timestamp, history counts can look like current activity.

Best practice:

1. Record the production cutover timestamp.
2. Confirm all old pods have terminated.
3. Stream new logs without history, or filter history to timestamps after the
   cutover.
4. Observe for several multiples of the old interval.
5. Report the time window and deployment name with every count.

The final verification used two clean production windows totaling 80 seconds
and a later 15-minute window. All showed zero `quickShare:claimJob` executions;
the 15-minute window showed zero Convex executions of any kind.

### A broad text patch briefly targeted the wrong image entry

An early GitOps patch changed the second matching image tag, which was the
renderer rather than media. Reviewing `git diff` caught it before commit or
deployment.

Best practice: patch repeated YAML fields using unique repository/controller
context, then inspect the exact staged diff before committing. Manifest builds,
linting, and reconciliation checks do not replace a human-readable diff review.

## Production release runbook

1. Calculate the idle execution rate before approving any timer or recurring
   schedule. Include replica count and downstream function fan-out.
2. Make protocol changes backward compatible across at least one rollout.
3. Configure required production environment keys using an identity with the
   narrow, verified permission. Do not print secret values.
4. Run tests, type checks, linting, `git diff --check`, `gitleaks`, and Lefthook.
5. Build each image once and capture the registry digest.
6. Push the release tag only after the release notes and deployment are approved.
7. Update GitOps with verified images, build the manifests, and run the repository
   security hooks.
8. Reconcile the Flux source and kustomization, then wait for both the HelmRelease
   and Kubernetes rollouts to report ready.
9. Confirm all old replicas are gone before removing compatibility behavior.
10. Check production Convex logs using a post-cutover time window and run
    `convex insights --details` against the explicit production deployment.

## Guardrails for future changes

- Do not add fixed-interval polling from replicated services to Convex.
- Recurring work must be declared in `convex/crons.ts`, use the longest practical
  interval, and be bounded or paginated.
- Self-rescheduling functions must have an explicit terminal condition and
  bounded retry policy.
- Event dispatch must be state-checked and safe to retry.
- Every cross-service function-signature change needs a compatibility plan.
- Every production cost verification must name the deployment and time window.
- Alert on unexpected per-function execution-rate increases so a polling
  regression is found in hours rather than after millions of calls.

## References

- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex actions](https://docs.convex.dev/functions/actions)
- [Convex best practices](https://docs.convex.dev/understanding/best-practices/)
