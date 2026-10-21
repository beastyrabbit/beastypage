# Umami test fixtures

Fetched from the self-hosted Umami 3.x instance on 21 October 2026:

- `https://umami.heerlab.com/script.js`, SHA-256 `654f12c7548be726eba5b71d5ef8bffc2a41a39a0053e2a49a847869ccd7ac3f`
- `https://umami.heerlab.com/recorder.js`, SHA-256 `21e6312866db01a71841b772c9882333231be1bc3fdbeeac1ed5193794ad80c6`

The upstream Umami and rrweb projects use the MIT license. These pinned scripts
are test fixtures, served by Playwright routes. Production loads scripts from
the configured Umami host only after consent. Recheck tracker and recorder
APIs and update the fixtures when upgrading Umami.

The tracker supports `data-website-id`, `data-domains`, `data-before-send`,
`data-exclude-search`, `data-exclude-hash`, `data-performance`,
`data-do-not-track`, and automatic History API pageviews. Its global API is
`umami.track`, `umami.identify`, and `umami.getSession`. We never call identify.
It reads, but does not set, the localStorage key `umami.disabled`.

The recorder accepts `data-website-id` and optional `data-host-url`. It fetches
`/api/websites/:id/recorder`, whose response controls `enabled`, `replayEnabled`,
`heatmapEnabled`, `sampleRate`, `heatmapSampleRate`, `maskLevel`, `maxDuration`
and `blockSelector`. Strict masking sets rrweb's `maskAllInputs: true` and
`maskTextSelector: "*"`. It uses rrweb's default `rr-block` and `rr-mask`
classes. It sends to `/api/record` with the in-memory tracker cache, and has
no public stop hook or storage writes. The frontend guard enforces consent,
strict masking, the block selector, and at most 15% sampling.

`clerk.js` is a minimal signed-out API fixture, not a real authentication client.
No user credentials or live provider calls are used in this suite.
