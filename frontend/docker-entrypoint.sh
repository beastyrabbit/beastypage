#!/bin/sh
set -e

# Runtime environment variable injection for Next.js
# This script replaces build-time placeholders with runtime values
# Required because Next.js NEXT_PUBLIC_* vars are embedded at build time

# Placeholder must match the ARG default in Dockerfile (valid URL format)
PLACEHOLDER_URL="https://placeholder.convex.cloud"
PLACEHOLDER_HOST="placeholder.convex.cloud"

if [ -n "$NEXT_PUBLIC_CONVEX_URL" ]; then
  echo "Injecting NEXT_PUBLIC_CONVEX_URL..."

  # Extract hostname from the new URL (e.g., "robust-porpoise-440.convex.cloud")
  NEW_HOST=$(echo "$NEXT_PUBLIC_CONVEX_URL" | sed 's|https://||' | sed 's|/.*||')

  # Escape special sed characters in the replacement strings
  # & = matched pattern, \ = escape char, | = our delimiter
  ESCAPED_URL=$(printf '%s' "$NEXT_PUBLIC_CONVEX_URL" | sed 's/[&/\|]/\\&/g')
  ESCAPED_HOST=$(printf '%s' "$NEW_HOST" | sed 's/[&/\|]/\\&/g')

  # Replace placeholder in all relevant files
  # With output: 'standalone', files are in .next/standalone and .next/static
  # Strings can be in .js, .json, .html, and .rsc (React Server Components) artifacts
  # Note: next.config.mjs splits the URL into hostname/protocol, so we must replace both
  find /app/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" \) 2>/dev/null | while read -r file; do
    if grep -q "$PLACEHOLDER_URL\|$PLACEHOLDER_HOST" "$file" 2>/dev/null; then
      sed -i "s|$PLACEHOLDER_URL|$ESCAPED_URL|g; s|$PLACEHOLDER_HOST|$ESCAPED_HOST|g" "$file"
    fi
  done

  # Also check root server.js and other files
  for file in /app/server.js /app/*.json; do
    if [ -f "$file" ] && grep -q "$PLACEHOLDER_URL\|$PLACEHOLDER_HOST" "$file" 2>/dev/null; then
      sed -i "s|$PLACEHOLDER_URL|$ESCAPED_URL|g; s|$PLACEHOLDER_HOST|$ESCAPED_HOST|g" "$file"
    fi
  done

  echo "Environment injection complete"
else
  echo "WARNING: NEXT_PUBLIC_CONVEX_URL not set"
  echo "The application may not be able to connect to the database"
fi

# Execute the main command (node server.js)
exec "$@"
