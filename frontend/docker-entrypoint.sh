#!/bin/sh
set -e

# Runtime environment variable injection for Next.js
# This script replaces build-time placeholders with runtime values
# Required because Next.js NEXT_PUBLIC_* vars are embedded at build time

PLACEHOLDER="__CONVEX_URL_PLACEHOLDER__"

if [ -n "$NEXT_PUBLIC_CONVEX_URL" ]; then
  echo "Injecting NEXT_PUBLIC_CONVEX_URL..."

  # Replace placeholder in all relevant files
  # With output: 'standalone', files are in .next/standalone and .next/static
  # Strings can be in .js, .json, and other artifacts
  find /app/.next -type f \( -name "*.js" -o -name "*.json" \) 2>/dev/null | while read -r file; do
    if grep -q "$PLACEHOLDER" "$file" 2>/dev/null; then
      sed -i "s|$PLACEHOLDER|$NEXT_PUBLIC_CONVEX_URL|g" "$file"
    fi
  done

  # Also check root server.js and other files
  for file in /app/server.js /app/*.json; do
    if [ -f "$file" ] && grep -q "$PLACEHOLDER" "$file" 2>/dev/null; then
      sed -i "s|$PLACEHOLDER|$NEXT_PUBLIC_CONVEX_URL|g" "$file"
    fi
  done

  echo "Environment injection complete"
else
  echo "WARNING: NEXT_PUBLIC_CONVEX_URL not set"
  echo "The application may not be able to connect to the database"
fi

# Execute the main command (node server.js)
exec "$@"
