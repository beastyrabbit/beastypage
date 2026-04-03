# BeastyPage

## Project Overview
Frontend and renderer service for BeastyPage with Docker/Kubernetes deploy flow.

## Mandatory Rules
- Use Conventional Commit format.
- Save Playwright screenshots in `.playwright-mcp/` only.
- Run release flow through version tags and verify Helm releases are reconciled in git-ops.
- Ensure `lefthook` is installed before development.

## Ports
- Dev frontend: `http://frontend.localhost:1355` (portless, via `pnpm run dev` in `frontend/`)
- Renderer service: `8001`
- Image processing: `8002`

## Required Commands
- Docker/local deploy and release steps are done via project scripts; prefer repo commands over ad-hoc shell scripts.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
