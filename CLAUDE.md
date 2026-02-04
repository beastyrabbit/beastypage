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
4. **After merging, create a version tag** (check latest with `git tag --sort=-v:refname | head -1`)
5. Push the tag to trigger a release (e.g., `git tag v1.7.0 && git push origin v1.7.0`)

## Local Docker Builds

Build and push frontend locally (faster than GitHub Actions):

```bash
cd frontend
docker build \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY=$POSTHOG_KEY \
  --build-arg NEXT_PUBLIC_POSTHOG_HOST=/bubu \
  --build-arg CONVEX_DEPLOYMENT=prod:standing-crane-709 \
  -t ghcr.io/beastyrabbit/beastypage-frontend:$VERSION .
docker tag ghcr.io/beastyrabbit/beastypage-frontend:$VERSION ghcr.io/beastyrabbit/beastypage-frontend:latest
docker push ghcr.io/beastyrabbit/beastypage-frontend:$VERSION
docker push ghcr.io/beastyrabbit/beastypage-frontend:latest
```

**Note:** GitHub Actions secrets (like `NEXT_PUBLIC_POSTHOG_HOST`) are baked into images at build time, overriding Dockerfile ARG defaults. To change build-time values, update the GitHub secret, not just the code.

## Kubernetes Deployment

Kubeconfig: `/home/beasty/projects/kub-homelab/talos/kubeconfig` (do NOT use `~` — flux CLI does not expand it)
Helmrelease: `~/projects/kub-homelab/cluster/homelab/apps/webpage/beastypage/helmrelease.yaml`

Full deploy sequence after updating the helmrelease image tag:
```bash
# 1. Commit and push the helmrelease change in kub-homelab
# 2. Reconcile git source so Flux sees the new commit
flux --kubeconfig=~/projects/kub-homelab/talos/kubeconfig reconcile source git flux-system
# 3. Reconcile the helmrelease
flux --kubeconfig=~/projects/kub-homelab/talos/kubeconfig reconcile helmrelease beastypage -n webpage
# 4. Verify pod image
kubectl --kubeconfig=~/projects/kub-homelab/talos/kubeconfig get pods -n webpage -l app.kubernetes.io/component=frontend -o jsonpath='{.items[*].spec.containers[*].image}'
```
