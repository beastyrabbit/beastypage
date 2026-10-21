# BeastyPage frontend

The frontend is a Next.js application backed by PostgreSQL/Drizzle.

For local development, start the database and apply migrations:

\`\`\`bash
pnpm --dir frontend run db:local up
pnpm --dir frontend run db:migrate
pnpm --dir frontend run dev
\`\`\`

Set the connection in \`.env.database.local\`. Clerk authentication is required for protected flows.

## Analytics and error reporting

Umami loads only after analytics consent. GlitchTip uses the Sentry browser,
Node and edge SDKs without user identity, replay, session tracking, cookies or
browser storage. Both are disabled unless `NEXT_PUBLIC_APP_ENV=production`.
Keep that variable unset locally. The app does not introduce a CSP.

The browser error SDK loads after the page load event and a hydration frame.
An in-memory buffer holds up to 20 early errors or rejected promises and flushes
them when initialization completes. Shared initial JavaScript measured about
313.6 KiB gzip without browser initialization, 458.2 KiB with eager initialization,
and 314.0 KiB with deferred initialization. The comparison sums unique root
bootstrap and common provider/header/footer client chunks using gzip level 9.
The eager increase exceeds the 25 kB threshold, so initialization is deferred.

Build-time public settings come from Infisical `prod` `/ci`:
`NEXT_PUBLIC_UMAMI_HOST`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`,
`NEXT_PUBLIC_UMAMI_DOMAINS`, `NEXT_PUBLIC_GLITCHTIP_DSN`, and the existing
Clerk publishable key. Docker derives `NEXT_PUBLIC_APP_VERSION` from
`APP_VERSION`; errors use release `beastypage@${APP_VERSION}`.
The workflow sets environment `production` only for `v*` tags, and `ci` otherwise.

Tag builds require `SENTRY_AUTH_TOKEN` through a BuildKit secret. It is never
an ARG or ENV. Source maps use the official Sentry SDK's Turbopack post-compile
hook and debug-ID artifact bundles. The upload target is
`SENTRY_URL=https://glitchtip.heerlab.com`,
`SENTRY_ORG=beasty-rabbit`, `SENTRY_PROJECT=beastypage`. Failed uploads fail
the build. Releases are created and finalized; commit association and deploy
records are disabled. No-token builds skip uploads. All generated maps and their
public references are deleted before output tracing, with or without a token.
Token-bearing builds disable Turbopack's filesystem cache because it persists
build environment values.
The generated `turbopack-worker` bootstrap is excluded from upload because CLI
rewriting leaves a dangling source-map comment on it. Application chunks are uploaded.

The fetched Umami 3.x tracker supports automatic history pageviews and native
performance metrics, so we do not send duplicate pageviews or web-vital events.
It excludes query strings and fragments. A before-send hook also strips sharing
capability paths and free-text error properties. No `identify` calls are made.
The recorder reads its settings from `/api/websites/:id/recorder`, rather than
script attributes. Our host-scoped transport guard enforces `maskLevel: strict`,
`sampleRate <= 0.15`, `heatmapSampleRate <= 0.15` and the auth/private block
selector. Signed-in content is blocked; anonymous text and all inputs are masked.
The server must enable replay/heatmaps for this website. On withdrawal, the guard
blocks sends immediately, including unload flushes, then reloads the page.

The shared cookie/storage inventory is `lib/telemetry/storage-inventory.ts`.
The preferences modal uses this list. The legal-pages work owns `/privacy`;
the consent banner and preferences modal keep their links to that route.

## Telemetry verification

`pnpm test:telemetry` builds and starts Next with public fake configuration,
then runs isolated Playwright tests. Umami scripts, recorder configuration,
collectors, Clerk's browser client and GlitchTip envelopes are intercepted with
local fixtures. It makes no live telemetry calls and needs no real credentials.
Screenshots go to the repository's `.playwright-mcp/` directory.
