# BeastyPage frontend

The frontend is a Next.js 16 application backed by PostgreSQL and Drizzle. Browser data access uses the HTTP routes and TanStack Query hooks under \`lib/data\`.

Use the local database for development:

\`\`\`bash
pnpm --dir frontend run db:local up
pnpm --dir frontend run db:migrate
\`\`\`

Put local connection settings in \`.env.database.local\`. Run \`pnpm run dev\` from \`frontend/\` for the portless development server.

Keep Clerk authentication mounted through \`proxy.ts\`; authenticated requests use Clerk identity with the PostgreSQL services.
