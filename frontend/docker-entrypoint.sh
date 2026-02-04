#!/bin/sh
set -e

# Runtime environment variable injection for Next.js
# This script replaces build-time placeholders with runtime values
# Required because Next.js NEXT_PUBLIC_* vars are embedded at build time

# Placeholders must match the ARG defaults in Dockerfile
CONVEX_PLACEHOLDER_URL="https://placeholder.convex.cloud"
CONVEX_PLACEHOLDER_HOST="placeholder.convex.cloud"
POSTHOG_PLACEHOLDER_KEY="phc_PLACEHOLDER_KEY"
POSTHOG_PLACEHOLDER_HOST="https://placeholder.posthog.com"

# Helper function to replace placeholders in all Next.js build artifacts
replace_in_files() {
  pattern="$1"
  replacement="$2"

  # Escape special sed characters
  escaped_replacement=$(printf '%s' "$replacement" | sed 's/[&/\|]/\\&/g')

  # Replace in .next directory
  find /app/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" \) 2>/dev/null | while read -r file; do
    if grep -q "$pattern" "$file" 2>/dev/null; then
      sed -i "s|$pattern|$escaped_replacement|g" "$file"
    fi
  done

  # Also check root files
  for file in /app/server.js /app/*.json; do
    if [ -f "$file" ] && grep -q "$pattern" "$file" 2>/dev/null; then
      sed -i "s|$pattern|$escaped_replacement|g" "$file"
    fi
  done
}

echo "Injecting runtime environment variables..."

# Convex URL injection
if [ -n "$NEXT_PUBLIC_CONVEX_URL" ]; then
  echo "  - NEXT_PUBLIC_CONVEX_URL"
  NEW_CONVEX_HOST=$(echo "$NEXT_PUBLIC_CONVEX_URL" | sed 's|https://||' | sed 's|/.*||')
  replace_in_files "$CONVEX_PLACEHOLDER_URL" "$NEXT_PUBLIC_CONVEX_URL"
  replace_in_files "$CONVEX_PLACEHOLDER_HOST" "$NEW_CONVEX_HOST"
else
  echo "  - WARNING: NEXT_PUBLIC_CONVEX_URL not set (database connection may fail)"
fi

# PostHog injection
if [ -n "$NEXT_PUBLIC_POSTHOG_KEY" ]; then
  echo "  - NEXT_PUBLIC_POSTHOG_KEY"
  replace_in_files "$POSTHOG_PLACEHOLDER_KEY" "$NEXT_PUBLIC_POSTHOG_KEY"
else
  echo "  - NEXT_PUBLIC_POSTHOG_KEY not set (analytics disabled)"
fi

if [ -n "$NEXT_PUBLIC_POSTHOG_HOST" ]; then
  echo "  - NEXT_PUBLIC_POSTHOG_HOST"
  replace_in_files "$POSTHOG_PLACEHOLDER_HOST" "$NEXT_PUBLIC_POSTHOG_HOST"
fi

echo "Environment injection complete"

# Execute the main command (node server.js)
exec "$@"
