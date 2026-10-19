# Contributing to BeastyPage

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v24 or higher (required by Portless)
- [pnpm](https://pnpm.io/) v10 or higher
- [Git](https://git-scm.com/)
- Access to the development PostgreSQL configuration in Infisical

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/beastypage.git
   cd beastypage
   ```
3. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   pnpm --dir frontend install --frozen-lockfile --ignore-scripts
   pnpm --dir backend/media_service install --frozen-lockfile
   npm --prefix backend/discord-bot ci
   pnpm --dir backend/image_processing_service install --frozen-lockfile
   (cd backend/renderer_service && uv sync --frozen --extra dev)
   lefthook install
   ```
4. Start the development server:
   ```bash
   pnpm dev
   ```

   For a frontend-only setup, start the per-worktree PostgreSQL database and
   then run the frontend:
   ```bash
   pnpm --dir frontend run db:local up
   pnpm --dir frontend run db:migrate
   pnpm --dir frontend dev
   ```

   Before the final command, copy the `DATABASE_URL` line from the gitignored
   `frontend/.env.database.local` into `frontend/.env.local` because Next.js
   does not load the helper's filename. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   and `CLERK_SECRET_KEY` there for signed-in flows. The root
   `pnpm dev:frontend` script is the Infisical-backed alternative for injecting
   Clerk and service runtime values; it does not provide `DATABASE_URL`.

   The frontend uses PostgreSQL through Drizzle. Database migrations are applied
   by the frontend init container; the full development setup reads runtime
   settings from Infisical, while `DATABASE_URL` remains in `frontend/.env.local`.

## How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/beastyrabbit/beastypage/issues) to avoid duplicates
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/environment details
   - Screenshots if applicable

### Suggesting Features

1. Open an issue with the "feature request" label
2. Describe the feature and its use case
3. Explain why it would benefit the project

### Submitting Pull Requests

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the code style guidelines
3. Run linting and type checks:
   ```bash
   pnpm run lint
   pnpm run typecheck
   ```
4. Commit with a descriptive message (see commit conventions below)
5. Push and open a PR against `main`

## Code Style

### General

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Keep functions focused and small
- Add comments for complex logic

### Frontend

- Use TailwindCSS for styling (no inline styles or CSS modules)
- Components go in `components/` directory
- Page components in `app/*/page.tsx`
- Use Radix UI primitives from `components/ui/`

### Linting

Biome is configured for linting and formatting. Run before committing:

```bash
pnpm run lint
```

### TypeScript

Ensure no type errors:

```bash
pnpm run typecheck
```

## Commit Message Conventions

Use clear, descriptive commit messages:

```
<type>: <short description>

[optional longer description]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting (no code change)
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:
```
feat: add dark mode toggle to settings
fix: prevent wheel from spinning when empty
docs: update README with new features
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Update documentation if needed
- Add tests for new features when applicable
- Ensure all checks pass before requesting review
- Respond to review feedback promptly

## Sprite Assets

The cat sprites are from ClanGen and licensed under CC BY-NC 4.0:
- Do not use sprites for commercial purposes
- Credit ClanGen when distributing
- Do not remove or modify license attributions

## Questions?

- Open an issue for project-related questions
- Check existing documentation first

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MPL-2.0 for code, CC BY-NC 4.0 for sprites/art).
