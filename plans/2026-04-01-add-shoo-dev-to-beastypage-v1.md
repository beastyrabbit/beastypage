# Adding shoo.dev to BeastyPage

## Objective

Add **shoo.dev** as a new site/domain served from the existing BeastyPage monorepo. This requires understanding that BeastyPage is currently a **single-tenant personal site** (BeastyRabbit) with no multi-site or domain-routing infrastructure. Adding shoo.dev means either (A) hosting a separate site within the same repo, or (B) adding multi-domain support so both beastyrabbit.com and shoo.dev are served from one Next.js app with different content per domain.

---

## Current State Assessment

| Aspect | Current State |
|--------|--------------|
| **Framework** | Next.js 16, App Router, standalone output |
| **Domain handling** | None -- single site, no middleware, no hostname checks |
| **Routing** | ~47 pages, all under a single flat route tree |
| **Layout** | Single root layout with BeastyRabbit branding (header, footer, favicon, metadata) |
| **Backend** | Shared Convex database, FastAPI renderer service |
| **Deployment** | Single Docker image -> Kubernetes via FluxCD HelmRelease |
| **Branding** | Hardcoded "BeastyRabbit" in header, footer, metadata, favicon |

---

## Approach Options

### Option A: Multi-Domain Single App (Recommended)
Serve both domains from one Next.js instance using middleware to detect the hostname and conditionally render different layouts, nav, branding, and content. Shared pages (like tools) can remain common.

**Pros:** Single deploy, shared code/components, one Convex backend, lower infra cost.
**Cons:** Increased routing complexity, middleware overhead, conditional logic throughout the layout tree.

### Option B: Separate Next.js App in Monorepo
Add a second `shoo-dev/` directory alongside `frontend/` with its own Next.js project, sharing packages via workspace.

**Pros:** Clean separation, independent deploys, no conditional logic.
**Cons:** Code duplication, two Docker images, two K8s deployments, two Convex projects (or shared auth complexity).

### Option C: Subdirectory Route Group
Add shoo.dev content as a route group under `frontend/app/(shoo)/` and use middleware to rewrite requests from shoo.dev to those routes.

**Pros:** Least disruptive to existing code, clean route separation.
**Cons:** Still needs middleware, branding conditionals in shared layout.

---

## Implementation Plan (Option A -- Multi-Domain Single App)

### Phase 1: Domain Detection Infrastructure

- [ ] 1. **Create `middleware.ts`** at `frontend/middleware.ts` to detect the incoming hostname (`request.headers.get('host')` or `request.nextUrl.hostname`). Set a custom header or cookie (`x-site-id: beastypage | shoo`) that downstream layouts/components can read. Match `shoo.dev`, `shoo.localhost`, and dev variants.

- [ ] 2. **Create a site config module** at `frontend/lib/site-config.ts` that exports per-site configuration objects: site name, description, favicon path, theme colors, nav items, footer links, social links, and metadata defaults. This becomes the single source of truth for all branding differences.

- [ ] 3. **Create a `SiteProvider` context** (or use `headers()` in server components) so any component in the tree can access the current site identity without prop-drilling.

### Phase 2: Route Organization

- [ ] 4. **Reorganize routes using Route Groups**. Move BeastyRabbit-specific pages into `frontend/app/(beastypage)/` and create `frontend/app/(shoo)/` for shoo.dev-specific pages. Shared pages (if any) stay at the top level or in a `(shared)/` group.

- [ ] 5. **Add middleware route matching** to rewrite/redirect requests from shoo.dev hostname to the `(shoo)` route group, and beastyrabbit.com to `(beastypage)`. This keeps URLs clean on each domain (shoo.dev shows `/` not `/shoo/`).

- [ ] 6. **Create shoo.dev pages** -- at minimum a homepage (`(shoo)/page.tsx`) and any other pages specific to the shoo.dev site. Define what content shoo.dev should actually serve (portfolio? dev blog? project showcase?).

### Phase 3: Branding & Layout Separation

- [ ] 7. **Create per-site root layouts**. Each route group gets its own `layout.tsx`:
  - `frontend/app/(beastypage)/layout.tsx` -- existing BeastyRabbit header/footer/metadata
  - `frontend/app/(shoo)/layout.tsx` -- shoo.dev-specific header/footer/metadata/favicon
  - The top-level `frontend/app/layout.tsx` becomes a thin shell (html/body tags, providers only).

- [ ] 8. **Create shoo.dev header component** (`frontend/components/shoo/site-header.tsx`) with its own nav config, branding, and styling.

- [ ] 9. **Create shoo.dev footer component** (`frontend/components/shoo/site-footer.tsx`) with appropriate links and copyright.

- [ ] 10. **Add shoo.dev static assets** -- favicon, apple-touch-icon, OG images, etc. under `frontend/public/shoo/` (or conditionally served via the middleware/layout).

- [ ] 11. **Update root metadata** to be dynamic based on site identity. Use `generateMetadata()` in each route group layout to set the correct title, description, icons, and OG tags per domain.

### Phase 4: Next.js Configuration

- [ ] 12. **Update `next.config.mjs`** to add shoo.dev-specific rewrites/redirects if needed. No changes required for standalone output or image config unless shoo.dev has its own image CDN.

- [ ] 13. **Add allowed dev origins** for `shoo.localhost` in the dev environment so local development works for both domains via portless.

### Phase 5: Deployment & Infrastructure

- [ ] 14. **DNS configuration** -- Point `shoo.dev` to the same Kubernetes ingress/load balancer that serves beastyrabbit.com. Both domains resolve to the same Next.js pod.

- [ ] 15. **TLS/SSL certificates** -- Add `shoo.dev` to the cert-manager Certificate or Ingress TLS configuration. If using Let's Encrypt with FluxCD, add the domain to the Ingress resource's `tls.hosts` and `rules`.

- [ ] 16. **Update Kubernetes Ingress** in the kub-homelab HelmRelease to add a second host rule for `shoo.dev` pointing to the same frontend service.

- [ ] 17. **No new Docker image needed** -- the same `beastypage-frontend` image serves both domains since middleware handles routing at runtime.

### Phase 6: Analytics & Monitoring

- [ ] 18. **PostHog configuration** -- Decide whether shoo.dev events go to the same PostHog project or a separate one. If same project, add a `site` property to all events via the PosthogProvider so you can filter by domain.

- [ ] 19. **Update Convex schema** (if needed) -- If shoo.dev stores its own data (blog posts, projects, etc.), add new tables to the Convex schema. If it's purely static, no backend changes needed.

### Phase 7: Versioning & Release

- [ ] 20. **Bump major version** -- Per `CLAUDE.md:60`, adding a net-new page/route triggers a major version bump. Adding an entire new site/domain is definitively a major version change.

---

## Verification Criteria

- Visiting `shoo.dev` in production shows shoo.dev-specific branding, navigation, and content
- Visiting `beastyrabbit.com` continues to work exactly as before with no regressions
- Local development supports both domains via `shoo.localhost:1355` and `frontend.localhost:1355`
- Middleware correctly identifies the site from the hostname on every request
- SEO metadata (title, description, OG tags, favicon) is correct per domain
- TLS certificates are valid for both domains
- PostHog analytics can distinguish events from each domain

## Potential Risks and Mitigations

1. **Middleware performance overhead on every request**
   Mitigation: Keep middleware logic minimal (hostname lookup in a Map, set header, return). Exclude static assets via `matcher` config.

2. **Shared component confusion -- which site am I editing?**
   Mitigation: Clear directory structure (`components/shoo/`, `components/beastypage/`, `components/shared/`) and naming conventions.

3. **Convex data isolation if shoo.dev needs its own data**
   Mitigation: Use a `siteId` field on relevant tables, or keep shoo.dev purely static (no Convex dependency).

4. **Certificate provisioning delay for new domain**
   Mitigation: Set up DNS and cert-manager config before deploying the code changes. Verify cert issuance with `kubectl describe certificate`.

5. **Breaking existing BeastyRabbit routes during route group migration**
   Mitigation: Move routes into `(beastypage)/` incrementally and test each one. Route groups in Next.js don't affect URL paths, so `/dash` stays `/dash`.

## Alternative Approaches

1. **Option B (Separate App)**: If shoo.dev is fundamentally different in tech stack or has no shared code with BeastyPage, spin up a second Next.js app under `shoo-dev/` in the monorepo with its own Dockerfile, K8s deployment, and Convex project. Higher infra cost but zero coupling.

2. **Option C (Subdirectory + Rewrite)**: Add all shoo.dev content under `frontend/app/shoo/[...]` and use middleware to strip the `/shoo` prefix for requests from the shoo.dev domain. Simpler than route groups but messier in the long run.

3. **Separate Repository**: If shoo.dev will evolve independently and has no shared dependencies, a completely separate repo is the cleanest option. Only viable if there's truly no code sharing.
