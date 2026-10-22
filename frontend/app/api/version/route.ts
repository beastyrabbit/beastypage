import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Build version baked into this image (the release tag). The release smoke
 * check polls it to see when a rollout has reached the live site.
 */
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
