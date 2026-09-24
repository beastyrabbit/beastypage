# BeastyPage - Development Guidelines

## Commit Messages

Commits should follow the **Conventional Commits** format for clarity.

### Conventional Commits Format

```
<type>: <description>

[optional body]
[optional footer]
```

### Common Prefixes

| Prefix | Description |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Maintenance tasks |
| `docs:` | Documentation only |
| `style:` | Code style changes |
| `refactor:` | Code refactoring |
| `test:` | Adding/updating tests |
| `ci:` | CI/CD changes |

### Examples

```bash
git commit -m "feat: add dark mode toggle"
git commit -m "fix: correct wheel spin animation"
git commit -m "chore: update dependencies"
```

## Versioning & Releases

Releases are triggered manually by pushing a git tag.

### Creating a Release

When you're ready to release a new version:

```bash
# Create and push a version tag
git tag v1.7.0
git push origin v1.7.0
```

The tag is the deployment: `.github/workflows/build-images.yml` publishes all images to GHCR as `X.Y.Z`, and Flux image automation in kub-homelab rolls them out within a few minutes. Never edit kub-homelab by hand.

### Versioning Rules

| Bump | When | Example |
|------|------|---------|
| **Major** (X.0.0) | Net-new page/route added (`frontend/app/*/page.tsx` creation) | `v2.0.0` |
| **Minor** (X.Y.0) | Page overhauls/replacements, new functionality on existing pages, new components | `v1.13.0` |
| **Patch** (X.Y.Z) | Bug fixes, small QoL improvements, dependency updates, chores | `v1.13.1` |

> Replacing/overhauling an existing route (e.g., palette-spinner → palette-generator) is minor, not major.

The CI frontend build takes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from Infisical `prod` `/ci` and bakes them into the image; change them there, not only in code. `NEXT_PUBLIC_CONVEX_URL` is a placeholder that `frontend/docker-entrypoint.sh` replaces at container start.

## Icons

When adding icons, always prefer [itshover icons](https://www.itshover.com/) before falling back to other icon libraries (e.g., Lucide, Heroicons, etc.).

## Playwright Screenshots

Always save Playwright screenshots to `.playwright-mcp/` (already gitignored). Never save screenshots to the repo root — they will pollute `git status`.

```ts
// Good
await page.screenshot({ path: '.playwright-mcp/my-screenshot.png' });

// Bad — saves to repo root, gets picked up by git
await page.screenshot({ path: 'my-screenshot.png' });
```

## Ports

Ports are managed by portless — check dev server output or `/home/beasty/projects/.ports` for registered defaults.

## Project Structure

- `frontend/` - Next.js application (see `frontend/CLAUDE.md` for details)
- `backend/renderer_service/` - Cat card renderer service (Python/FastAPI)
- `backend/discord-bot/` - Discord bot service (TypeScript/discord.js)
- `.github/workflows/` - CI/CD pipelines

## Git Hooks (Lefthook)

```bash
lefthook install
```

Hooks defined in `lefthook.yml`:
- **gitleaks** - Scans staged changes for secrets
- **ruff-lint** / **ruff-format** - Lints and formats Python in `backend/`
- **tsc** - Type-checks TypeScript in `frontend/`
- **tsc-discord-bot** - Type-checks TypeScript in `backend/discord-bot/`

## Development Workflow

1. Create a feature branch from `main`
2. Make changes with Conventional Commit messages
3. Open a PR and merge to `main`
4. **After merging, create a version tag** (check latest with `git tag --sort=-v:refname | head -1`)
5. Push the tag to trigger a release (e.g., `git tag v1.7.0 && git push origin v1.7.0`)

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
