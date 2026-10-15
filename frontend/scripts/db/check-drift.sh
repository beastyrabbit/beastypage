#!/bin/sh
# Fails when the Drizzle schema has changes that no migration in drizzle/ covers.
# Generates into a temporary copy, so the working tree is never touched.
set -eu
cd "$(dirname "$0")/../.."

# drizzle-kit mangles absolute --out paths, so stay relative (gitignored).
tmp=".drift-check"
rm -rf "$tmp"
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp"
cp -R drizzle "$tmp/drizzle"

# drizzle-kit can print an error and still exit 0; treat any error as failure.
if ! output="$(./node_modules/.bin/drizzle-kit generate \
  --dialect postgresql \
  --schema ./server/db/schema/index.ts \
  --out "./$tmp/drizzle" \
  --name drift-check 2>&1)" || printf '%s' "$output" | grep -qiE '(^|[^a-z])error'; then
  printf '%s\n' "$output" >&2
  echo "Drift check could not run." >&2
  exit 1
fi

if ! diff -rq drizzle "$tmp/drizzle" >/dev/null; then
  echo "Schema drift: server/db/schema has changes without a migration." >&2
  diff -rq drizzle "$tmp/drizzle" >&2 || true
  echo "Run 'pnpm --dir frontend run db:generate', review the SQL and commit it." >&2
  exit 1
fi
echo "No schema drift."
