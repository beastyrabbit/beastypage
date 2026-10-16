import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { getPaletteImageUrl } from "@/server/services/palette";
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug)
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  if (dataBackend() === "postgres")
    return NextResponse.json(await getPaletteImageUrl(getDb(), slug));
  const url = getServerConvexUrl();
  if (!url)
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 500 },
    );
  try {
    return NextResponse.json(
      await new ConvexHttpClient(url).query(
        api.paletteGeneratorSettings.getImageUrl,
        { slug },
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load palette image" },
      { status: 500 },
    );
  }
}
