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

This triggers the Docker build workflow which:
- Builds both frontend and renderer images
- Tags them with the version (e.g., `1.7.0`, `1.7`)
- Pushes to GitHub Container Registry

### Docker Build Triggers

| Trigger | What builds | Image tags |
|---------|-------------|------------|
| Push to `main` | Only changed packages | `latest`, commit SHA |
| Push `v*` tag | Both packages | Version (e.g., `1.7.0`), `1.7` |
| Manual dispatch | Selected packages | `latest`, commit SHA |

## Project Structure

- `frontend/` - Next.js application (see `frontend/CLAUDE.md` for details)
- `backend/renderer_service/` - Cat card renderer service (Python/FastAPI)
- `.github/workflows/` - CI/CD pipelines

## Git Hooks (Lefthook)

```bash
lefthook install
```

Hooks defined in `lefthook.yml`:
- **gitleaks** - Scans staged changes for secrets
- **ruff-lint** / **ruff-format** - Lints and formats Python in `backend/`
- **tsc** - Type-checks TypeScript in `frontend/`

## Development Workflow

1. Create a feature branch from `main`
2. Make changes with Conventional Commit messages
3. Open a PR and merge to `main`
4. When ready to release, push a version tag (e.g., `git tag v1.7.0 && git push origin v1.7.0`)
