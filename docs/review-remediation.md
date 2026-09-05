# September 2026 review remediation

This change addresses the [project review](https://schaffa.dev/p/m8tcd0usfcrqvulf) against `1284343a6f78af9cc8b8481e57cd7c4ded20d8f0`. It prepares code and validation for a PR. It does not deploy services, migrate live data, configure secrets, or verify production behavior.

## Finding map

| Finding | Result and regression coverage |
| --- | --- |
| F01 | Adoption public projections omit editing capabilities. Linking an existing profile requires its owner or editing token. Batch metadata requires its creator identity or a newly issued private batch token. Synthetic Convex tests cover denial and public viewing. |
| F02 | Legacy hosts must sign in. Mutations enforce host ownership, participant membership and token, live/current rounds, allowed choices, closed polls, removed participants, and one participant vote per round. Host tie-break votes remain supported. Queries use bounded indexes and omit participant capabilities. |
| F03 | Next Discord preference routes require a service bearer credential. Convex config functions are internal and reachable through an authenticated HTTP action. The bot supplies the credential. Tests cover both boundaries with synthetic values. |
| F04 | Image downloads validate every resolved address and redirect, pin the selected public address, reject nonstandard ports, and bound bytes and total time. Fake DNS and transport tests cover redirect rejection, pinning, and streamed byte limits. |
| F05 | Both delivery workflows require a successful cat-system contract job before Convex deployment. A workflow regression checks the dependency and success predicate. |
| F06 | Renderer batches admit at most 256 total frames, 1,024-pixel tiles, and a conservative 16-million-pixel working budget. Invalid work is rejected before queue admission. |
| F07 | Image processing runs in at most two disposable worker threads, with cancellation, a deadline, a 256 MB JavaScript heap limit per worker, and byte/pixel/work admission limits. Small real-worker tests cover health responsiveness and cancellation. Native Sharp allocations are bounded by image/work limits, not the JavaScript heap setting. |
| F08 | Metadata/probe failure leaves media private and failed. Explicit unsafe-media rejection stays unsupported. Only a validated original can be used after conversion failure; derivative storage failures remain retryable. |
| F09 | Batch overrides clear all related compatibility aliases before applying arrays, booleans, or pose changes. Pixel/parameter regressions cover empty arrays, false values, and pose replacement. |
| F10 | Bayer 8×8 uses all 64 ordered thresholds. Tests verify the matrix and actual dithered pixels. |
| F11 | Spritesheet packing copies RGBA pixels without applying alpha a second time. Pixel equality tests include translucent input. |
| F12 | A collection response serves its selected surviving upload directly. A local service test covers an unavailable first upload and a ready later upload. |
| F13 | The profile now offers “Reset saved variants” and explicitly says the account, profile, shared content, and sessions remain. Reset deletes the authenticated user's variants in retryable batches of 100. It does not claim to delete a Clerk account. |
| F14 | Pixelator repairs input and blend references after disabling, removing, reordering, or restoring steps. Only earlier enabled steps are selectable. Unit tests cover both reference kinds. |
| F15 | Pixelator aborts superseded fetches and clears stale results when the image, pipeline, or output mode changes. Browser tests hold responses pending and verify cancellation, clearing, and image reset. |
| F16 | Media and image-processing publication requires successful service checks in both workflows. PR validation runs their type/tests and media lint. |
| F17 | Unit tests no longer start a renderer. The renderer integration project starts and verifies its own ephemeral listener, then stops only that process. |
| F18 | Catdex loads approval-indexed pages of 48, enriches only each page, and shares season/rarity reads within that page. A bounded pending-existence query replaces the count subscription. Pagination tests cover uniqueness and approval filtering. Search, filters, and sorting apply to loaded cards, with explicit UI copy and a load-more control. |
| F19 | Collection art is a named button. The dialog supports keyboard opening, Tab containment, Escape, and focus restoration. Chromium tests exercise the actual components with synthetic data. |
| F20 | HTTP rendering accepts PNG only and rejects unsupported automatic variant expansion. Diagnostics=false suppresses layer diagnostics/timing. Docs describe base → params → overrides precedence and tests cover the contract. |

## Optional maintenance

- Encoded image intermediates are released after their final input/blend consumer. A branching pipeline test protects shared consumers. No raw-buffer rewrite or render-result cache was added without profiling evidence.
- Media shutdown rejects new jobs and drains current work for up to ten seconds. An unfinished lease remains recoverable after the deadline.
- Pixelator proxy deadlines and browser cancellation remain active through response-body consumption.
- Renderer runtime dependencies no longer include pytest. The bot image prunes development dependencies after compilation. Image sizes were not measured because no container was built or published.
- Removed inert renderer cache settings. Existing sprite caching remains. Component READMEs now describe the actual services, Portless entry point, sprite source, and shared-versus-local Convex behavior.
- Direct frontend typecheck generates ignored version metadata first. Convex TypeScript uses the current package's generated-config template.
- Frontend Biome configuration matches the installed version. Changed first-party TypeScript files were formatted; legacy asset JSON and adapted-code exclusions were retained. Newly reported optional-chain diagnostics in two unchanged files remain scoped warnings. Python pins Ruff and a scoped first-party rule set. Pillow/AnyIO/FastAPI deprecated call sites were updated. One upstream Starlette test-client warning remains.
- Forgejo's manual Convex deployment requires main, matching GitHub. Both workflows remain maintained; this change does not establish which provider operates production.

## Admission limits

The image service accepts at most 10 MB of decoded input bytes, four million decoded pixels, and 32 million weighted pixel operations. Dithering and quantization carry a weight of four; a blend adds one. Preview mode scales to the configured preview size before checking pipeline work. Detection still validates the full image. Workers return busy or timeout responses instead of an unbounded backlog. These are conservative limits, not a measured throughput or native-memory guarantee.

The renderer's budget includes padded output-sheet cells, retained source frames, and extra layer-mode storage. Its queue and catalog integrity checks remain in place.

## Compatibility and approved rollout

Do not deploy this entire final state over legacy replicas in one step. Production rollout requires separate human approval and the repository's version-tag release flow.

1. Prepare an additive Convex release containing the new optional schema/index fields and the authenticated Discord HTTP endpoint plus internal config implementations under new names, while retaining the old function names for existing replicas. The final internal-only conversion in this PR belongs to phase 3, not this preparatory release. Provision `DISCORD_API_TOKEN`, at least 32 random characters, through the approved secret mechanism in the bot, frontend, and Convex environments. Configure the frontend's Convex HTTP site URL.
2. Update the bot to send the bearer header, then update the frontend to use the authenticated HTTP config route and pass adoption/stream capabilities. Wait until every old bot/frontend replica has stopped. Do not infer this from image publication. Old browser tabs must reload before editing or voting under the new authority rules.
3. Apply the final Convex enforcement and internal-only config functions. Old unauthenticated clients intentionally fail closed. Ownerless legacy stream sessions cannot be claimed by a caller-supplied identity; hosts create new signed-in sessions. Old batches without creator authority remain viewable but cannot have metadata edited. No automatic ownership migration is included.
4. After all legacy replicas are gone, use time-filtered logs to check signature/authentication errors and verify Helm reconciliation in git-ops. No such production checks were run for this PR.

This document specifies required preparatory work; the final-state branch alone is not an additive rollout artifact. Do not roll back only the frontend while leaving incompatible Convex enforcement in place. Keep the secure endpoint and matching client together, or pause the affected feature while preparing a compatible rollback. Never restore public editing-token projections.

## Dependency advisory triage

Package-manager updates refresh the reachable Jimp file parser and compatible frontend, media, image, bot, and FastAPI/Starlette dependency groups. The unused polyfill plugin was removed after checking imports/configuration. The wheel uses browser canvas, so its unused optional native `canvas` install is excluded. This makes no claim about browser bundle-size savings.

Compatible patch overrides update old `brace-expansion` and `js-yaml` transitive branches. Remaining frontend audit matches are in Clerk's Solana wallet/mobile tree: `uuid` 8, `stream-json` 1, and Metro's `image-size` 1. Patched versions require unsupported transitive major upgrades. Inspected application code does not invoke those mobile build parsers or wallet JSON streaming APIs. Reachability through third-party code is not proven absent; retain these as upstream dependency follow-ups instead of forcing incompatible replacements. No live or malformed-input exploitation tests were performed.

Recheck registry advisories before release. Native libraries, operating-system images, and production configuration are outside these package audits.

## Verification scope

Run the root `cat-system:build`, `media:check`, and `image-processing:check` commands, the scoped Ruff checks, and `pnpm --dir frontend exec playwright test`. Browser fixtures use actual Collection, Profile, and Pixelator components with local assets and fake auth/database hooks. They block nonlocal requests. They verify UI state and keyboard behavior, not live Clerk/Convex/Discord/S3 integration. Screenshot evidence is kept outside tracked source and published through Schaffa in the PR.
