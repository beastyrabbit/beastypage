# BeastyPage frontend

The frontend is a Next.js application backed by PostgreSQL/Drizzle.

For local development, start the database and apply migrations:

\`\`\`bash
pnpm --dir frontend run db:local up
pnpm --dir frontend run db:migrate
pnpm --dir frontend run dev
\`\`\`

Set the connection in \`.env.database.local\`. Clerk authentication is required for protected flows; PostHog is optional.

Migration import and verification tools remain under \`scripts/migration/\` for historical export archives. They operate on export ZIPs and do not run as application services.
