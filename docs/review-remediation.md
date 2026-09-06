# September 2026 review remediation

This change addresses the [project review](https://schaffa.dev/p/m8tcd0usfcrqvulf) against `1284343a6f78af9cc8b8481e57cd7c4ded20d8f0`. The bridge candidate adds the secured clients and APIs while preserving temporary legacy entry points for a phased release. Full enforcement requires the cleanup release below; code checks do not establish production delivery.

## Finding map

| Finding | Result and regression coverage |
| --- | --- |
| F01 | Adoption public projections omit editing capabilities. Linking an existing profile requires its owner or editing token. Batch metadata requires its creator identity or a newly issued private batch token. Synthetic Convex tests cover denial and public viewing. |
| F02 | New hosts must sign in. Mutations enforce host ownership, participant membership and token, live/current rounds, allowed choices, closed polls, removed participants, and one participant vote per round. Host tie-break votes remain supported. Queries use bounded indexes and omit participant capabilities. |
| F03 | Next Discord preference routes require a service bearer credential. New Convex config functions are internal and reachable through an authenticated HTTP action. Temporary legacy config functions remain until cleanup. The bot supplies the credential. Tests cover both boundaries with synthetic values. |
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
| F15 | Pixelator aborts superseded fetches. Setting edits retain a marked previous result and disable export until the new result arrives. Image replacement or disabling every step clears the result. Browser tests hold responses pending and verify these transitions. |
| F16 | Media and image-processing publication requires successful service checks in both workflows. PR validation runs their type/tests and media lint. |
| F17 | Unit tests no longer start a renderer. The renderer integration project starts and verifies its own ephemeral listener, then stops only that process. |
| F18 | Catdex loads approval-indexed pages of 48, enriches only each page, and shares season/rarity reads within that page. A bounded pending-existence query replaces the count subscription. Pagination tests cover uniqueness and approval filtering. Search, filters, and sorting apply to loaded cards, with explicit UI copy and a load-more control. |
| F19 | Collection art is a named button. The dialog supports keyboard opening, Tab containment, Escape, and focus restoration. Chromium tests exercise the actual components with synthetic data. |
| F20 | HTTP rendering accepts PNG only and rejects unsupported automatic variant expansion. Diagnostics=false suppresses layer diagnostics/timing. Docs describe base → params → overrides precedence and tests cover the contract. |

## Optional maintenance

- Encoded image intermediates are released after their final input/blend consumer. A branching pipeline test protects shared consumers. No raw-buffer rewrite or render-result cache was added without profiling evidence.
- Media shutdown rejects new jobs and drains current work for up to ten seconds. An unfinished lease remains recoverable after the deadline.
- Pixelator proxy deadlines and browser cancellation remain active through response-body consumption.
- Renderer runtime dependencies no longer include pytest. The bot image prunes development dependencies after compilation. No image-size reduction is claimed.
- Removed inert renderer cache settings. Existing sprite caching remains. Component READMEs now describe the actual services, Portless entry point, sprite source, and shared-versus-local Convex behavior.
- Direct frontend typecheck generates ignored version metadata first. Convex TypeScript uses the current package's generated-config template.
- Frontend Biome configuration matches the installed version. Changed first-party TypeScript files were formatted; legacy asset JSON and adapted-code exclusions were retained. Newly reported optional-chain diagnostics in two unchanged files remain scoped warnings. Python pins Ruff and a scoped first-party rule set. Pillow/AnyIO/FastAPI deprecated call sites were updated. One upstream Starlette test-client warning remains.
- Forgejo's manual Convex deployment requires main, matching GitHub. Both workflows remain maintained; this change does not establish which provider operates production.

## Admission limits

The image service accepts at most 10 MB of decoded input bytes, four million decoded pixels, and 32 million weighted pixel operations. Dithering and quantization carry a weight of four; a blend adds one. Preview mode scales to the configured preview size before checking pipeline work. Detection still validates the full image. Workers return busy or timeout responses instead of an unbounded backlog. These are conservative limits, not a measured throughput or native-memory guarantee.

The renderer's budget includes padded output-sheet cells, retained source frames, and extra layer-mode storage. Its queue and catalog integrity checks remain in place.

## Compatibility and approved rollout

Production delivery uses explicit human approval and the version-tag release flow. A main-branch merge builds images but no longer deploys Convex; version tags and explicit main-branch dispatch retain the contract gate.

1. Provision a single `DISCORD_API_TOKEN` of at least 32 random characters through the approved secret mechanism in the bot, frontend, and Convex environments. The frontend also needs `CONVEX_SITE_URL`. Verify equality without exposing values.
2. Publish the bridge release, planned as `v7.5.0`. Its Convex deployment adds `adoptionV2`, `streamSessionsV2`, `streamParticipantsV2`, `streamVotesV2`, `discordUserConfigInternal`, the authenticated Discord HTTP route, Catdex pagination/pending APIs, and `users.resetSavedVariants`. New clients use those APIs. The old namespaces retain old argument validators during this phase. Public projections never return editing or participant capabilities.
3. After the bridge backend is deployed, roll the bot first so it sends the service credential. Then roll the frontend and remaining services through GitOps. Confirm the live image identities and that every legacy service replica has stopped. Image publication alone is insufficient.
4. Publish the enforcement release, planned as `v7.5.1`, removing temporary `adoption`, `streamSessions`, `streamParticipants`, `streamVotes`, `discordUserConfig`, `rolloutLegacy` and the `users.deleteAccount` placeholder. Keep the V2 and internal API names unchanged. New frontend replicas already use them, so removing legacy names cannot change their contracts.
5. Reconcile the final version in GitOps, verify the public serving version at desktop and mobile sizes, and inspect time-filtered logs only after legacy replicas are gone.

The temporary stream APIs reject records with an owner or the V2 `allowedOptions` marker, including empty arrays. Legacy updates never introduce that marker, and legacy vote queries include records without a round field. Legacy adoption creation preserves previews but never patches referenced profiles. Its metadata mutation rejects batches with creator authority. During the bridge, legacy ownerless data and Discord config still have their former public access; this exposure ends only with cleanup. Old account-deletion calls throw a reload instruction without deleting data or falsely reporting success.

Old browser tabs must reload after enforcement. Ownerless legacy streams cannot be claimed by caller-supplied identities; hosts create new signed-in sessions. Old batches without creator authority remain viewable through V2 but cannot have metadata edited. There is no automatic ownership migration. Rollback must keep a frontend with the V2 calls and its matching backend. Never restore public editing-token projections.

## Dependency advisory triage

Package-manager updates refresh the reachable Jimp file parser and compatible frontend, media, image, bot, and FastAPI/Starlette dependency groups. The unused polyfill plugin was removed after checking imports/configuration. The wheel uses browser canvas, so its unused optional native `canvas` install is excluded. This makes no claim about browser bundle-size savings.

Compatible patch overrides update old `brace-expansion` and `js-yaml` transitive branches. Remaining frontend audit matches are in Clerk's Solana wallet/mobile tree: `uuid` 8, `stream-json` 1, and Metro's `image-size` 1. Patched versions require unsupported transitive major upgrades. Inspected application code does not invoke those mobile build parsers or wallet JSON streaming APIs. Reachability through third-party code is not proven absent; retain these as upstream dependency follow-ups instead of forcing incompatible replacements. No live or malformed-input exploitation tests were performed.

Recheck registry advisories before release. Native libraries, operating-system images, and production configuration are outside these package audits.

## Verification scope

Run the root `cat-system:build`, `media:check`, and `image-processing:check` commands, the scoped Ruff checks, and `pnpm --dir frontend exec playwright test`. Browser fixtures use actual Collection, Profile, Pixelator, Host, and Catdex components with local assets and fake auth/database hooks. They block nonlocal requests. They verify UI state and keyboard behavior, not live Clerk/Convex/Discord/S3 integration. Screenshot evidence is kept outside tracked source and published through Schaffa in the PR.

## PR feedback

- Quick Share catches failed history requests, shows a retryable error beside recent shares, and preserves existing items. A browser test verifies HTTP 500 recovery through refresh without an unhandled exception.

- Pixelator preserves images up to 4,000 pixels on the longest side and four million pixels in total. A 4,000 × 800 image remains full size. Worker validation errors keep their safe hints; unexpected decoder errors remain masked.
- Clearing tie-break choices retains the current round and its deciding votes. Earlier rounds are not restored. The host UI states this explicitly. Host votes retain only bounded label/step strings and recognized coin-flip provenance after authorization; participant metadata comes from the server.
- The legacy `catdex.list` endpoint remains capped at 48 for compatibility. Clients needing every card must use `catdex.page` until pagination completes.
- Configure the bot's `FRONTEND_API_URL` with the canonical origin, using HTTPS publicly or the existing trusted in-cluster service address. Redirects are rejected so a bearer credential is never forwarded to a different endpoint. Set the same `DISCORD_API_TOKEN` through the approved secret mechanism in the bot, frontend, and Convex. Local frontend/bot environment checks require it. Frontend config reads use `CONVEX_SITE_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL`; they do not depend on the separate Convex query URL.
- Image download sources must return an `image/*` Content-Type. Missing headers are rejected intentionally. Temporary DNS abort listeners are removed as soon as resolution settles.
- Frontend, bot, and image-processing Docker stages and contract CI use Node 24. Renderer test dependencies explicitly include PyYAML. `httpx2` remains because the installed Starlette test client imports it and deprecates its `httpx` fallback.
- Convex declarations were regenerated locally with the installed CLI, including the new Discord and stream modules. No deployment was needed.
