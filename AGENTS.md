# BeastyPage

## Project Overview
Frontend and renderer service for BeastyPage with Docker/Kubernetes deploy flow.

## Mandatory Rules
- Use Conventional Commit format.
- Save Playwright screenshots in `.playwright-mcp/` only.
- Run release flow through version tags and verify Helm releases are reconciled in git-ops.
- Ensure `lefthook` is installed before development.

## Ports
- Dev frontend: `http://frontend.localhost:1355` (portless, via `bun run dev` in `frontend/`)
- Renderer service: `8001`
- Image processing: `8002`

## Required Commands
- Docker/local deploy and release steps are done via project scripts; prefer repo commands over ad-hoc shell scripts.
