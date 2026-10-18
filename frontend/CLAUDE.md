# BeastyPage Frontend

This is a Next.js 16 application with React 19. PostgreSQL is the database, accessed through Drizzle repositories and service modules under \`server/\`.

Development commands:

\`\`\`bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run db:local up
pnpm run db:migrate
\`\`\`

The application uses Clerk for authentication, TanStack Query for browser data fetching, and PostHog for optional analytics. API routes under \`app/api\` validate input and call PostgreSQL services. Public links resolve by slug, legacy imported identifier, or UUID through the legacy-link repository.

Cat sprites live under \`public/assets/\`. Keep the existing palette and cat-system type modules as the source of truth for frontend generation.
