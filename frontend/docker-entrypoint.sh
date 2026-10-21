#!/bin/sh
set -e

# Runtime environment variable injection for Next.js
# This script replaces build-time placeholders with runtime values
# Required because Next.js NEXT_PUBLIC_* vars are embedded at build time

# Placeholders must match the ARG defaults in Dockerfile
CLERK_PLACEHOLDER_KEY="pk_placeholder_CLERK_KEY"

# Helper function to replace placeholders in all Next.js build artifacts
replace_in_files() {
  pattern="$1"
  replacement="$2"

  # Escape special sed replacement characters and make the placeholder a
  # literal match. Without escaping, dots in URLs become regex wildcards and
  # can rewrite unrelated content in the generated bundle.
  escaped_pattern=$(printf '%s' "$pattern" | sed 's/[][\\.^$*|]/\\&/g')
  escaped_replacement=$(printf '%s' "$replacement" | sed 's/[&/\|]/\\&/g')

  # Replace in .next directory
  find /app/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" \) 2>/dev/null | while read -r file; do
    if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
      sed -i "s|$escaped_pattern|$escaped_replacement|g" "$file"
    fi
  done

  # Also check root files
  for file in /app/server.js /app/*.json; do
    if [ -f "$file" ] && grep -Fq -- "$pattern" "$file" 2>/dev/null; then
      sed -i "s|$escaped_pattern|$escaped_replacement|g" "$file"
    fi
  done
}

echo "Injecting runtime environment variables..."

# Clerk publishable key injection
if [ -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then
  echo "  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  replace_in_files "$CLERK_PLACEHOLDER_KEY" "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
else
  echo "  - WARNING: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY not set (auth will fail)"
fi

echo "Environment injection complete"

# Execute the main command (node server.js)
exec "$@"
