import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the schema against drizzle/meta and needs
// no database. Apply migrations with `pnpm run db:migrate`, never `drizzle-kit migrate`,
// so the advisory lock and schema-version checks always run.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
