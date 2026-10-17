# Release verification

A version tag builds all five service images. Verify the running workloads and HelmRelease after the tag; the tag and Flux pin are inputs to that check, not its result.

For a release `X.Y.Z`:

1. Inspect each GHCR image's manifest digest with `skopeo inspect --raw`.
2. Read the image tags and digests from the running deployments and pods in namespace `webpage`. Compare pod `imageID` digests with the manifest digests, not only the human-readable tag.
3. Check `HelmRelease/beastypage` for `Ready` and for a stalled upgrade. A failed rollout can age out of the event stream quickly.
4. Read the Flux source of truth from the kub-homelab remote and confirm every image pin changed to the intended version.
5. Exercise a client-rendered route with Playwright. `curl` only proves that the HTML shell responds; it cannot verify client-only harness markup or the signed-in `/dash` version.

When a release changes the generated cat-system hash, build frontend, renderer, and Discord from the same tag and verify their reported hashes before switching traffic. Keep the previous stack available until external smoke checks pass. Never suppress a catalog mismatch.

Production delivery remains an explicit, approved release action. Merging a pull request does not deploy the Convex backend or push a version tag.
