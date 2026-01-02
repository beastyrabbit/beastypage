# Contributing to BeastyPage

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- [Git](https://git-scm.com/)
- A [Convex](https://convex.dev) account (for database features)

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/beastypage.git
   cd beastypage
   ```
3. Install dependencies:
   ```bash
   cd frontend
   bun install
   ```
4. Start the development server:
   ```bash
   bun run dev
   ```

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
   bun run lint
   bun run typecheck
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

ESLint is configured for the project. Run before committing:

```bash
bun run lint
```

### TypeScript

Ensure no type errors:

```bash
bun run typecheck
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
