# Release verification

A version tag builds all five service images. Verify the running workloads and HelmRelease after the tag; the tag and Flux pin are inputs to that check, not its result.

## Automated checks

`build-images.yml` checks two things around each tag.

**Before building, `release-gate` proves that validation passed.** The tag does not re-run the source checks. It reuses the pull request's `validate.yml` result, which counts only when it covers exactly the tagged code:

1. The gate looks up the pull request associated with the tag commit and takes that PR's newest `validate.yml` run, whatever its result.
2. The run must have finished with both `applications` and `database` successful.
3. The run must have recorded the tree it tested (a `validated-tree-<tree>` artifact), and that tree must equal the tag commit's tree. A PR run tests the merge of the PR into `main` as it was at that time, so this holds when nothing else landed on `main` between that run and the merge.

Alternatively, the newest manual `validate.yml` run on the tag commit itself must have passed. While a matching run is still in progress the gate waits up to 45 minutes. A missing run, a failed or cancelled run, a different tree, or a GitHub API error stops the release before any image is built. The job log names the run it accepted or rejected.

**After building, `deploy-smoke` checks the live site.** Flux image automation picks up the new tag within a few minutes, then upgrades `HelmRelease/beastypage`. The job polls `https://beastyrabbit.com/api/version` for up to 30 minutes until it reports the tag on three consecutive polls. It then requires `/` to answer 200, `/api/health/database` to report `ok`, and `/api/renderer/health` to report `status: ok`. If the site already reports a newer version, the job fails as superseded instead of passing.

The smoke check reads the frontend's version only. The renderer, image-processing, media and Discord services roll out separately and can switch at different times; the manual steps below cover them.

## When the gate fails

The error message names the cause. Common ones:

- Another pull request landed on `main` after this PR's last validation run, so the tested tree differs.
- The tag points at a commit pushed straight to `main`, which has no pull request.
- The PR's newest validation run failed or was cancelled.

To recover, validate the exact tagged commit and then retry the release run. Do not delete and re-push the tag.

```bash
gh workflow run validate.yml --ref vX.Y.Z
gh run watch "$(gh run list --workflow validate.yml --event workflow_dispatch --limit 1 --json databaseId -q '.[0].databaseId')"
gh run rerun <build-images run id> --failed
```

Re-running the failed jobs repeats the gate, which now accepts the manual run, and then runs the skipped builds.

## When the smoke check fails

- **Timeout:** the tag did not reach the site in 30 minutes. Check the beastypage `ImagePolicy` objects in `flux-system`, `HelmRelease/beastypage`, and the frontend pods and their migration init container in namespace `webpage`.
- **Superseded:** a newer tag rolled out first. Verify that release instead.
- **Unhealthy:** the release is live but a health route failed. The job log shows the route and response. Investigate it and roll back if necessary.

## Manual verification

For a release `X.Y.Z`:

1. Inspect each GHCR image's manifest digest with `skopeo inspect --raw`.
2. Read the image tags and digests from the running deployments and pods in namespace `webpage`. Compare pod `imageID` digests with the manifest digests, not only the human-readable tag.
3. Check `HelmRelease/beastypage` for `Ready` and for a stalled upgrade. A failed rollout can age out of the event stream quickly.
4. Read the Flux source of truth from the kub-homelab remote and confirm every image pin changed to the intended version.
5. Exercise a client-rendered route with Playwright. `curl` only proves that the HTML shell responds; it cannot verify client-only harness markup or the signed-in `/dash` version.

When a release changes the generated cat-system hash, build frontend, renderer, and Discord from the same tag and verify their reported hashes before switching traffic. Keep the previous stack available until external smoke checks pass. Never suppress a catalog mismatch.

Production delivery remains an explicit, approved release action. Merging a pull request does not deploy production PostgreSQL workloads or push a version tag.
