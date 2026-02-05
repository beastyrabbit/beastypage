#!/bin/sh
# Writes the latest git tag into lib/dash/version.ts for build-time version tracking.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$SCRIPT_DIR/../lib/dash/version.ts"

VERSION="${APP_VERSION:-$(git describe --tags --abbrev=0 2>/dev/null || echo "dev")}"

cat > "$OUT" <<EOF
export const APP_VERSION: string = "$VERSION";
EOF

echo "Wrote APP_VERSION=$VERSION to lib/dash/version.ts"
