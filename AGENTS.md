# BeastyPage

## Project Overview
Frontend and renderer service for BeastyPage with Docker/Kubernetes deploy flow.

## Mandatory Rules
- Use Conventional Commit format.
- Save Playwright screenshots in `.playwright-mcp/` only.
- Never release or deploy to a shared or production environment without explicit human approval in the current conversation. Requests to implement, finish, merge, or prepare are not deployment approval. Before creating or pushing release tags, pushing changes that trigger deployment, changing production GitOps/infrastructure/secrets, or running production smoke tests, ask and wait for a clear instruction such as "yes, deploy."
- After deployment is explicitly approved, run the release flow through version tags and verify Helm releases are reconciled in git-ops.
- Ensure `lefthook` is installed before development.
- Do not use fixed-interval polling from replicated services for Convex background work; prefer atomic event dispatch with bounded retry and infrequent recovery sweeps.
- Roll out cross-service protocol and Convex function-signature changes in backward-compatible phases, and verify time-filtered production logs only after all legacy replicas are gone.

## Ports
- Dev frontend: `http://frontend.localhost:1355` (portless, via `pnpm run dev` in `frontend/`)
- Renderer service: `8001`
- Image processing: `8002`

## Required Commands
- Approved Docker/deploy and release steps are done via project scripts; prefer repo commands over ad-hoc shell scripts.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
