# BeastyPage

## Project Overview
Frontend and renderer service for BeastyPage with Docker/Kubernetes deploy flow.

## Mandatory Rules
- Use Conventional Commit format.
- Save Playwright screenshots in `.playwright-mcp/` only.
- Never release or deploy to a shared or production environment without explicit human approval in the current conversation. Requests to implement, finish, merge, or prepare are not deployment approval. Before creating or pushing release tags, pushing changes that trigger deployment, changing production GitOps/infrastructure/secrets, or running production smoke tests, ask and wait for a clear instruction such as "yes, deploy."
- After deployment is explicitly approved, run the release flow through version tags and verify Helm releases are reconciled in git-ops.
- Ensure `lefthook` is installed before development.
- Do not use fixed-interval polling from replicated services for PostgreSQL background work; prefer atomic event dispatch with bounded retry and infrequent recovery sweeps.
- Roll out cross-service protocol and database function-signature changes in backward-compatible phases, and verify time-filtered production logs only after all legacy replicas are gone.

## Ports
- Dev frontend: `http://frontend.localhost:1355` (portless, via `pnpm run dev` in `frontend/`)
- Renderer service: `8001`
- Image processing: `8002`

The backend uses PostgreSQL through Drizzle. Production uses the
`beastypage-postgres` CNPG cluster in the `webpage` namespace. The frontend init
container applies migrations before the application starts. Infisical stores
database credentials under `/kubernetes/webpage/beastypage-postgres` and
frontend runtime configuration under
`/kubernetes/webpage/beastypage-frontend-runtime-config`.
