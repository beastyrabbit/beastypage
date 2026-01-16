# BeastyPage - Development Guidelines

## Commit Messages & Versioning

This project uses **Release Please** for automated versioning. Commits must follow the **Conventional Commits** format.

### Conventional Commits Format

```
<type>: <description>

[optional body]
[optional footer]
```

### Common Prefixes

| Prefix | Description | Version Bump |
|--------|-------------|--------------|
| `feat:` | New feature | Minor (1.3.0 → 1.4.0) |
| `fix:` | Bug fix | Patch (1.3.0 → 1.3.1) |
| `feat!:` or `BREAKING CHANGE:` | Breaking change | Major (1.3.0 → 2.0.0) |
| `chore:` | Maintenance tasks | No bump (batched) |
| `docs:` | Documentation only | No bump (batched) |
| `style:` | Code style changes | No bump (batched) |
| `refactor:` | Code refactoring | No bump (batched) |
| `test:` | Adding/updating tests | No bump (batched) |
| `ci:` | CI/CD changes | No bump (batched) |

### How Release Please Works

1. **You**: Create feature branch, make changes, open PR with Conventional Commit title
2. **You**: Merge your feature PR to main
3. **Release Please**: Auto-creates/updates a "Release PR" with version bump + CHANGELOG
4. **You** (when ready): Merge the Release PR
5. **Release Please**: Creates git tag → triggers Docker image build

### Examples

```bash
# Feature (minor bump)
git commit -m "feat: add dark mode toggle"

# Bug fix (patch bump)
git commit -m "fix: correct wheel spin animation"

# Breaking change (major bump)
git commit -m "feat!: redesign API response format"

# No version bump
git commit -m "chore: update dependencies"
git commit -m "docs: add API documentation"
```

## Project Structure

- `frontend/` - Next.js application (see `frontend/CLAUDE.md` for details)
- `backend/renderer_service/` - Cat card renderer service (Python/FastAPI)
- `.github/workflows/` - CI/CD pipelines

### Versioned Packages

Both packages share the same version and are managed by Release Please:

| Package | Version File | Type |
|---------|--------------|------|
| `frontend` | `frontend/package.json` | node |
| `backend/renderer_service` | `backend/renderer_service/pyproject.toml` | python |

## Pre-commit Hooks

```bash
pip install pre-commit && pre-commit install
```

Runs: gitleaks (secrets), ruff (Python), tsc (TypeScript)

## Development Workflow

1. Create a feature branch from `main`
2. Make changes with Conventional Commit messages
3. Open a PR and merge to `main`
4. Release Please handles versioning automatically
