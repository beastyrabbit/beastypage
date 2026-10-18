# Convex to PostgreSQL cutover runbook

This is the forward-only procedure for issue #116. It is written for the
maintainer and the platform, media and data owners. Production remains on
Convex until every approval marked **[APPROVAL REQUIRED]** is recorded in the
change ticket. Once step 8 starts, PostgreSQL is the only write source:
failures mean staying in maintenance, restoring PostgreSQL, or applying a
forward fix. Never write to Convex again.

The commands below are run from a checked-out release of this repository. Set
`FRONTEND` to its absolute `frontend/` directory and keep `ARCHIVE` and every
report directory on encrypted storage outside the repository.

## Procedure

1. **Confirm prerequisites and approvals** — *maintainer, 30–60 minutes;
   [APPROVAL REQUIRED]*

   Attach these to the change ticket before scheduling the window:

   - homelab CNPG cluster `beastypage-postgres` is Ready in namespace
     `webpage`, with the `beastypage_owner`, `beastypage_app` and temporary
     `beastypage_import` credentials available through Infisical at
     `/kubernetes/webpage/beastypage-postgres`;
   - the staging cluster is `beastypage-staging-postgres` in
     `beastypage-staging`, and only scrubbed data is present; staging secrets
     are at `/kubernetes/beastypage-staging/postgres`;
   - the `beastypage_import` role is login-enabled only for the rehearsal or
     cutover window through the kub-homelab Flux flow, and the approved
     `DATABASE_IMPORT_URL` lives in its own `*-import-url` secret that only the
     operator's one-off import pod mounts (never the frontend Deployment) and
     never appears in this repository;
   - the staging restore drill is complete and its measured time is at most
     one hour, with the backup name and verification output attached;
   - the staging rehearsal has a maintainer sign-off;
   - the media release that reads `CONTROL_PLANE_URL` is deployed with the
     variable still unset, so it keeps calling Convex, and Quick Share works
     unchanged. Do not point it at `/api/internal/quick-share` yet: that route
     answers 404 until the frontend runs with `DATA_BACKEND=postgres`. See
     [Quick Share](areas/quick-share.md);
   - the frontend environment contains `CLERK_SECRET_KEY` (synced from
     Infisical `/kubernetes/webpage/beastypage-clerk-secret`; check the name,
     never the value). With `DATA_BACKEND=postgres` the proxy mounts
     `clerkMiddleware()`, which needs it for every API request;
   - the release contains the same schema version as the target cluster and
     `pnpm exec biome check` and the migration test suite are green.

   **Expected output:** a ticket comment containing the cluster names, secret
   paths (paths only, never values), restore timing, rehearsal sign-off and
   the media rollout observation.

   **Failure action:** stop before the window. Resolve the missing prerequisite
   or reschedule; do not enable maintenance.

2. **Rehearse the complete cutover in staging** — *data owner and maintainer,
   45–90 minutes; [APPROVAL REQUIRED]*

   Use the scrubbed PostgreSQL dump produced by the staging scrubber. Never use
   the raw production export in staging. Restore the dump as the staging owner
   through the approved staging secret, then inject staging's import URL and
   run:

   ```sh
   : "${STAGING_OWNER_URL:?Inject the staging owner URL through the approved secret workflow}"
   : "${DATABASE_IMPORT_URL:?Inject DATABASE_IMPORT_URL through the approved staging secret workflow}"
   : "${STAGING_SCRUB_KEY:?Set STAGING_SCRUB_KEY in the operator environment}"
   pg_restore --clean --if-exists --no-owner \
     --dbname "$STAGING_OWNER_URL" /private/beastypage-staging/scrubbed.dump
   DATABASE_MIGRATION_URL="$STAGING_OWNER_URL" pnpm run db:migrate
   DATABASE_MIGRATION_URL="$STAGING_OWNER_URL" pnpm run db:migrate --status
   pnpm run scrub:staging --verify \
     --staging-issuer https://<clerk-development-issuer> \
     --staging-password-file /private/beastypage-staging/password \
     --report-dir /private/beastypage-staging/verify-report \
     --i-know-this-is-staging --expected-database beastypage
   pnpm run smoke:cutover \
     --base-url https://<staging-host> \
     --fixtures /private/beastypage-staging/smoke-fixtures.json \
     --auth-file /private/beastypage-staging/operator-auth.json \
     --expect-maintenance \
     --report-dir /private/beastypage-staging/smoke-report
   ```

   **Expected output:** `scrub:staging --verify` and `smoke:cutover` print `OK`
   with all checks passed. The fixture
   file contains one read path for each migrated area, a migrated `fileId`, a
   live topic and a write path; the auth file is never passed as a header
   value. Turn the staging gate off after the rehearsal and repeat a read
   smoke check.

   `DATABASE_IMPORT_URL` is injected from the staging secret before
   `scrub:staging`; its value is never placed in a command argument or report.
   The raw temporary import and scrub that produce `scrubbed.dump` are the
   workstation steps in [staging.md](staging.md), not a second import of the
   scrubbed dump.

   **Failure action:** stay in staging maintenance, inspect the private
   reports, and apply a forward fix. Do not copy a failing database or data
   back to Convex.

3. **Take and verify the final PostgreSQL backup** — *platform owner, 10–20
   minutes; [APPROVAL REQUIRED]*

   ```sh
   # Check both standbys are healthy before this cold snapshot. With three
   # instances, synchronous ANY 1 and dataDurability: required, the snapshot
   # fences the chosen standby; if the other standby is down, primary commits
   # can pause for the snapshot duration.
   kubectl -n webpage cnpg status beastypage-postgres
   BACKUP_NAME="beastypage-postgres-pre-cutover-$(date -u +%Y%m%dT%H%MZ)"
   kubectl -n webpage cnpg backup beastypage-postgres \
     --method volumeSnapshot --online=false --backup-target prefer-standby \
     --backup-name "$BACKUP_NAME"
   kubectl -n webpage wait --for=condition=Completed \
     "backup/$BACKUP_NAME" --timeout=30m
   kubectl -n webpage get backup "$BACKUP_NAME" -o wide
   ```

   **Expected output:** the backup is `Completed`, names the intended CNPG
   cluster and is retained until the maintainer deletes it after the watch
   period. Record the backup name, snapshot location and completion time.

   **Failure action:** stay on Convex and reschedule. If a backup exists but
   cannot be verified, take another one; do not start the gate.

   A scheduled cold backup has the same fencing risk while the cluster is
   degraded. Suspend the `ScheduledBackup` until both standbys are healthy if
   the status check shows a degraded cluster. See [CNPG data durability and
   synchronous replication](https://cloudnative-pg.io/docs/1.30/replication/#data-durability-and-synchronous-replication).

4. **Enable the maintenance gate and stop new jobs** — *platform owner,
   2–5 minutes; [APPROVAL REQUIRED]*

   Set `MAINTENANCE_MODE=1` and `JOBS_ENABLED=0` in the frontend's Infisical
   secret (Flux reverts `kubectl set env`); Reloader restarts every replica:

   ```sh
   kubectl -n webpage rollout status deployment/beastypage-frontend --timeout=10m
   status="$(curl -sS -D /tmp/beastypage-maintenance.headers -o /tmp/beastypage-maintenance.json -w '%{http_code}' -X POST "https://<public-host>/api/cat-share" \
     -H 'content-type: application/json' -d '{}')"
   test "$status" = 503
   test "$(jq -r .code /tmp/beastypage-maintenance.json)" = unavailable
   rg -qi '^Retry-After: 60\r?$' /tmp/beastypage-maintenance.headers
   health_status="$(curl -sS -o /tmp/beastypage-health.json -w '%{http_code}' "https://<public-host>/api/health/database")"
   test "$health_status" = 503
   test "$(jq -r .reason /tmp/beastypage-health.json)" = 'postgres backend not selected'
   ```

   **Expected output:** the write is HTTP 503 with `code: "unavailable"` and a
   `Retry-After` header. The database health route intentionally returns 503
   while Convex is selected; check it after step 8, once PostgreSQL is active. The
   site-wide banner is visible. Existing reads are still served. This gate
   also covers `/i/api/**`, so media uploads stop.

   **Failure action:** keep maintenance enabled, repair the deployment or
   forward-fix the gate, and repeat the checks. Do not continue while any
   replica accepts a write.

5. **Pause Convex and drain media** — *Convex owner and media owner, 5–15
   minutes; [APPROVAL REQUIRED]*

   In the Convex deployment dashboard, choose **Deployment settings → Pause
   deployment** for the production deployment and record the confirmation
   time. The pause is an operator action because Convex has no repository
   command that is safe to guess. Then drain the media workers using the
   deployment's reviewed maintenance procedure and confirm no worker is
   processing an old control-plane job:

   ```sh
   kubectl -n media rollout pause deployment/beastypage-media
   kubectl -n media get pods -l app=beastypage-media -o wide
   ```

   **Expected output:** the Convex dashboard shows `Paused`; media workers
   have stopped taking new jobs and their queue is empty or explicitly
   drained. Do not delete workers or S3 objects.

   **Failure action:** remain in maintenance. Resume only the media drain
   operation needed to clear a lease; never resume Convex writes.

6. **Record the freeze and prove there were no writes after it** — *data owner,
   5–10 minutes; [APPROVAL REQUIRED]*

   ```sh
   FREEZE_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   printf '%s\n' "$FREEZE_AT" > /private/beastypage-cutover/freeze-at.txt
   kubectl -n webpage logs deployment/beastypage-frontend \
     --since=30m | rg 'MAINTENANCE_MODE|503|write' > /private/beastypage-cutover/frontend-gate.log
   ```

   Use the Convex dashboard's deployment log export (or its documented log
   query) to search for mutation/action writes after `FREEZE_AT`. Attach the
   query and an empty result, plus the dashboard pause confirmation, to the
   ticket. The timestamp in `freeze-at.txt` is the `--freeze-at` value for the
   final import if the archive filename does not carry a timestamp.

   **Expected output:** no Convex write event has a timestamp later than
   `FREEZE_AT`; the gate log contains only rejected requests and health/read
   traffic.

   **Failure action:** keep maintenance and repeat the pause/drain. If a write
   occurred after the timestamp, choose a new freeze timestamp and obtain a
   new export. Never merge the post-freeze write into PostgreSQL by hand.

7. **Export Convex and import PostgreSQL** — *data owner, 10–60 minutes;
   [APPROVAL REQUIRED]*

   Download the final export from the paused Convex deployment into encrypted
   storage. Set `ARCHIVE` to its private path. The deployed frontend image
   contains the bundled `import-convex.mjs` and `verify-import.mjs` runners
   under `/app/scripts/migration`, including the matching musl Sharp binary.
   Build and run this image in the staging rehearsal first (#112/#116), then
   use the exact bytes already running in the production frontend pod.

   ```sh
   # shellcheck shell=bash
   set -Eeuo pipefail
   ARCHIVE="/private/beastypage-cutover/snapshot_<deployment>_<ns>.zip"
   NS=webpage
   IMPORT_POD=beastypage-postgres-import
   REPORT=/private/beastypage-cutover/import-report
   VERIFY_REPORT=/private/beastypage-cutover/verify-report
   LOGIN_FLUX_NAMESPACE=flux-system
   LOGIN_FLUX_KUSTOMIZATION="<webpage-kustomization>"
   CLEANUP_SCRIPT=deploy/postgres/production/import-cleanup.sh
   IMPORT_POD_RENDERED=
   IMPORT_ARCHIVE="/work/archive/$(basename "$ARCHIVE")"
   FREEZE_AT="$(cat /private/beastypage-cutover/freeze-at.txt)"
   copy_reports() {
     mkdir -p "$REPORT" "$VERIFY_REPORT"
     chmod 700 "$REPORT" "$VERIFY_REPORT"
     kubectl cp --no-preserve "$NS/$IMPORT_POD:/work/reports/import/." "$REPORT/" || true
     kubectl cp --no-preserve "$NS/$IMPORT_POD:/work/reports/verify/." "$VERIFY_REPORT/" || true
     find "$REPORT" "$VERIFY_REPORT" -type d -exec chmod 700 {} +
     find "$REPORT" "$VERIFY_REPORT" -type f -exec chmod 600 {} +
   }
   cleanup() {
     rc=$?
     cleanup_failed=0
     set +e
     rm -f "${IMPORT_POD_RENDERED:-}"
     if ! IMPORT_CLEANUP_NAMESPACE="$NS" IMPORT_CLEANUP_POD="$IMPORT_POD" \
       LOGIN_FLUX_NAMESPACE="$LOGIN_FLUX_NAMESPACE" \
       LOGIN_FLUX_KUSTOMIZATION="$LOGIN_FLUX_KUSTOMIZATION" \
       "$CLEANUP_SCRIPT"; then
       echo "cleanup failed: merge the reviewed beastypage_import login:false change and rerun $CLEANUP_SCRIPT" >&2
       cleanup_failed=1
     fi
     if [ "$cleanup_failed" -ne 0 ] && [ "$rc" -eq 0 ]; then rc=1; fi
     return "$rc"
   }
   trap 'exit 130' INT TERM
   trap cleanup EXIT
   # Apply the reviewed ephemeral template in
   # deploy/postgres/production/import-pod.yaml with the exact frontend image
   # digest used by a Ready frontend pod. It has no service-account token, runs as UID 1001
   # with a read-only root filesystem, and mounts only
   # beastypage-postgres-import-url through envFrom. Its disk-backed emptyDir
   # is the only archive copy in Kubernetes; never use a PVC. HOME is /tmp for
   # Node/Sharp caches. The CA volume
   # selects ca.crt only because CNPG's generated beastypage-postgres-ca
   # secret also contains ca.key.

   FRONTEND_SELECTOR="$(kubectl -n "$NS" get deploy beastypage-frontend -o json \
     | jq -r '.spec.selector.matchLabels | to_entries | map("\(.key)=\(.value)") | join(",")')"
   : "${FRONTEND_SELECTOR:?frontend Deployment selector is empty}"
   FRONTEND_IMAGE="$(kubectl -n "$NS" get pods -l "$FRONTEND_SELECTOR" -o json \
     | jq -r '[.items[]
       | select(any(.status.conditions[]?; .type == "Ready" and .status == "True"))
       | .status.containerStatuses[]?
       | select(.name == "main")
       | .imageID
       | select(type == "string")
       | sub("^docker-pullable://"; "")
       | select(test("@sha256:[0-9a-f]{64}$"))] | first // empty')"
   if [ -z "$FRONTEND_IMAGE" ]; then
     echo "no Ready frontend pod has a digest imageID for container main" >&2
     exit 1
   fi

   IMPORT_POD_RENDERED="$(mktemp "${TMPDIR:-/tmp}/import-pod.XXXXXX.yaml")"
   chmod 600 "$IMPORT_POD_RENDERED"
   python3 -c '
   from pathlib import Path
   import sys

   template = Path("deploy/postgres/production/import-pod.yaml").read_text()
   marker = "__FRONTEND_IMAGE__"
   image = sys.argv[1]
   if marker not in template:
       raise SystemExit("import-pod image marker is missing")
   print(template.replace(marker, image), end="")
   ' "$FRONTEND_IMAGE" >"$IMPORT_POD_RENDERED"
   cat "$IMPORT_POD_RENDERED" | kubectl apply -f -
   rm -f "$IMPORT_POD_RENDERED"
   kubectl -n "$NS" wait --for=condition=Ready "pod/$IMPORT_POD" --timeout=5m
   kubectl cp --no-preserve "$ARCHIVE" \
     "$NS/$IMPORT_POD:/work/archive/$(basename "$ARCHIVE")"

   # Keep the import URL value out of command arguments and output. Run the
   # importer and verifier from inside the pod; the archive and reports are
   # outside the checkout, and the import role is temporarily enabled only by
   # the kub-homelab Flux change.

   kubectl -n "$NS" exec "$IMPORT_POD" -- sh -c \
     "cd /app && node scripts/migration/import-convex.mjs \
       --archive '$IMPORT_ARCHIVE' --report-dir /work/reports/import \
       --expected-database beastypage \
       --freeze-at '$FREEZE_AT' \
       --expected-issuer https://<clerk-production-issuer> \
       --replace --confirm-remote-replace" || { copy_reports; exit 1; }
   kubectl -n "$NS" exec "$IMPORT_POD" -- sh -c \
     "cd /app && node scripts/migration/verify-import.mjs \
       --archive '$IMPORT_ARCHIVE' --import-report /work/reports/import/report.json \
       --expected-database beastypage \
       --expected-issuer https://<clerk-production-issuer> \
       --report-dir /work/reports/verify" || { copy_reports; exit 1; }
   copy_reports
   test -s "$REPORT/report.json"
   test -s "$VERIFY_REPORT/verify-import.json"
   ```

   `LOGIN_FLUX_KUSTOMIZATION` names the kub-homelab Flux object containing the
   paired change that sets `beastypage_import` back to `login: false`. Prepare
   and merge the enable and disable changes together before the window. If the
   disable change is not merged when cleanup starts, cleanup must fail loudly;
   the operator merges it and reruns `deploy/postgres/production/import-cleanup.sh`
   before any rerun.

   **Expected output:** the importer says `complete`; `verify:import` says
   `OK`. Counts include only documented skips/quarantines, fingerprints match,
   imported legacy links resolve, sampled converted rows match, and every
   referenced file's bytes hash to its stored SHA-256. The `EXIT` trap always
   deletes the pod and confirms it is gone, then reconciles the Flux change
   that disables `beastypage_import`. The
   operator's original archive remains at its encrypted private path
   (`/private/beastypage-cutover/...`) until the retention decision is
   recorded, following the handling rule in [importer.md](importer.md) and
   this runbook's evidence policy; then delete the archive and private
   reports, retaining only count and fingerprint evidence.

   The migration init container runs `db:migrate` as
   `beastypage_owner`. After Drizzle migrations and the schema-version write,
   that owner-held runner invokes `applyRoleGrants`, which applies the app and
   import schema/table/sequence/default-privilege grants before this import
   command runs. Verify the app role with `\dp public.*`, `\ddp`, and a
   harmless insert/update/delete plus sequence call. The application pool and
   live-event listener set the three timeout values per connection; a role
   default is optional, requires superuser/CNPG-managed-role authority, and is
   not required for cutover.

   Before applying the pod, the platform owner applies the normal kub-homelab
   Flux change enabling `beastypage_import` login, with the reviewed matching
   disable-login change prepared and already merged for cleanup. The cleanup
   trap above is the required path for success, importer failure, verifier
   failure and abort. The frontend Deployment never mounts the import URL (it
   gets only `beastypage-postgres-app-url`, and its init container only
   `beastypage-postgres-migration-url`). The role's owner-applied DML, sequence
   and `TRUNCATE` grants are required by `--replace`.

   **Failure action:** stay in maintenance. The cleanup trap must complete
   before any rerun. For an importer defect, apply a forward fix and rerun with
   the same archive; for database damage, use the restore procedure in
   [operations.md](operations.md) and verify it. Never resume or write to
   Convex.

8. **Switch the application to PostgreSQL** — *platform owner and maintainer,
   5–15 minutes; [APPROVAL REQUIRED]*

   The deployments are managed by Flux, so change the values in Infisical,
   never with `kubectl set env` (Flux would revert it):

   - frontend secret: `DATA_BACKEND=postgres`, `JOBS_ENABLED=1`, the
     `DATABASE_URL` for `beastypage_app`;
   - media secret (`beastypage-media-secret`):
     `CONTROL_PLANE_URL=https://<public-host>/api/internal/quick-share`.

   The Infisical operator syncs within five minutes and Reloader restarts
   both deployments. Then wait for both rollouts:

   ```sh
   kubectl -n webpage rollout status deployment/beastypage-frontend --timeout=10m
   kubectl -n media rollout status deployment/beastypage-media --timeout=10m
   curl -fsS "https://<media-host>/health"
   : "${MEDIA_INTERNAL_TOKEN:?Inject the media internal token through the approved secret workflow}"
   dispatch_status="$(curl -sS -o /tmp/beastypage-media-dispatch.json -w '%{http_code}' \
     -X POST "https://<media-host>/i/api/internal/jobs/<known-fixture-job-id>" \
     -H "Authorization: Bearer $MEDIA_INTERNAL_TOKEN")"
   test "$dispatch_status" = 202 || test "$dispatch_status" = 204
   ```

   Media switches its control plane here, inside the window, because the
   PostgreSQL route only answers once the frontend runs on PostgreSQL.
   Convex-mode browser writes use Convex's websocket and therefore cannot be
   stopped by the frontend gate alone; pausing Convex in step 5 is mandatory.

   **Expected output:** every replica reports `DATA_BACKEND=postgres`, the
   database readiness endpoint is HTTP 200, and media health plus the dispatch
   probe succeed. `MAINTENANCE_MODE=1` deliberately keeps the jobs worker
   stopped even though `JOBS_ENABLED=1`; verify the worker only after the gate
   is lifted in step 10.

   **Failure action:** keep maintenance enabled. Fix configuration forward or
   restore PostgreSQL from the pre-cutover backup; do not point the app back at
   Convex.

9. **Run cutover smoke checks** — *application owner, 5–10 minutes;
   [APPROVAL REQUIRED]*

   Prepare a private fixture file with one read path per migrated area (slugs
   and IDs are operator supplied), a PostgreSQL file UUID, a live topic, and a
   harmless write path. Prepare an auth file containing the admin cookie or
   header for the jobs status route. Then run:

   ```sh
   pnpm run smoke:cutover \
     --base-url https://<public-host> \
     --fixtures /private/beastypage-cutover/smoke-fixtures.json \
     --auth-file /private/beastypage-cutover/operator-auth.json \
     --expect-maintenance \
     --report-dir /private/beastypage-cutover/smoke-report
   ```

   **Expected output:** `OK`; database health, each supplied read, image plus
   ETag, live SSE snapshot, and zero dead jobs pass; the write remains HTTP
   503. The command never prints credentials or fixture values.

   **Failure action:** stay in maintenance. Fix the PostgreSQL service or
   forward-fix the route, rerun import verification if data changed, and rerun
   smoke checks.

10. **Lift the gate** — *maintainer, 2–5 minutes; [APPROVAL REQUIRED]*

    Set `MAINTENANCE_MODE=0` in the frontend's Infisical secret, then:

    ```sh
    kubectl -n webpage rollout status deployment/beastypage-frontend --timeout=10m
    write_status="$(curl -sS -o /tmp/beastypage-write.json -w '%{http_code}' -X POST "https://<public-host>/api/<safe-write-route>" \
      -H 'content-type: application/json' -d '<operator-approved-body>')"
    case "$write_status" in 2??|4??) ;; *) echo "unexpected write status: $write_status" >&2; exit 1 ;; esac
    curl -fsS -H "$(cat /private/beastypage-cutover/operator-auth-header.txt)" \
      https://<public-host>/api/internal/jobs/status
    ```

    **Expected output:** the banner disappears, a safe PostgreSQL write returns
    an explicitly accepted 2xx success or 4xx validation response, the jobs
    status route reports a running worker with no dead rows, and Convex remains paused. The
    operator must explicitly approve this step after step 9 is green.

    **Failure action:** set `MAINTENANCE_MODE=1` again and keep the PostgreSQL
    source of truth. Restore PostgreSQL or apply a forward fix as appropriate.

11. **Watch the new source of truth** — *application and platform owners,
    first 15 minutes continuously, then 24 hours; [APPROVAL REQUIRED]*

    ```sh
    kubectl -n webpage logs deployment/beastypage-frontend --since=15m | rg 'job_dead|error|latency'
    curl -fsS -H "$(cat /private/beastypage-cutover/operator-auth-header.txt)" \
      https://<public-host>/api/internal/jobs/status
    kubectl -n webpage get pods -o wide
    ```

    **Expected output:** no new dead jobs, stable live-update latency, normal
    HTTP error rates, healthy CNPG replicas and successful media dispatches.
    Record 15-minute, one-hour and 24-hour observations. Keep Convex paused.

    **Failure action:** for an application defect stay in maintenance and apply
    a forward fix; for PostgreSQL health or data loss restore the pre-cutover
    backup to a new cluster and point the application at the restored
    PostgreSQL service. Never write to Convex.

## Go/no-go checklist

- [ ] **[APPROVAL REQUIRED]** Maintainer, platform, data, media and Convex
  owners are named for the window.
- [ ] CNPG clusters, Infisical paths and role credentials are verified.
- [ ] Restore drill evidence meets the one-hour RTO.
- [ ] Staging scrubbed rehearsal and sign-off are attached.
- [ ] The media release that reads `CONTROL_PLANE_URL` is live with it unset, and `CLERK_SECRET_KEY` is present in the frontend environment.
- [ ] Final PostgreSQL backup is `Completed` and its name is recorded.
- [ ] Maintenance write and read/health checks pass on every frontend replica.
- [ ] Convex is paused; media is drained; `FREEZE_AT` and the no-write log query
  are recorded.
- [ ] Final import used `--expected-issuer`; `verify:import` is `OK`.
- [ ] `DATA_BACKEND=postgres` and `JOBS_ENABLED=1` are live on every frontend
  replica, media health and dispatch checks pass, and media uses the
  PostgreSQL `CONTROL_PLANE_URL`.
- [ ] `smoke:cutover` is `OK` with the maintenance write assertion.
- [ ] **[APPROVAL REQUIRED]** Maintainer approved lifting the gate.
- [ ] After lifting the gate, `/api/internal/jobs/status` reports the jobs
  worker running with no dead rows.
- [ ] The post-cutover watch has no dead jobs, abnormal latency or error rates.

## Evidence to retain

Keep the encrypted final archive and private import, verification and smoke
reports until the retention decision is recorded. Keep counts, fingerprints,
the archive SHA-256, freeze timestamp, no-write evidence, CNPG backup name and
restore timing, rollout revisions, smoke fixture paths (never their contents),
and the 15-minute/one-hour/24-hour watch notes. Do not attach archives,
quarantine files, reports containing document content, cookies, tokens or
personal data to chat, issues or CI artifacts.
