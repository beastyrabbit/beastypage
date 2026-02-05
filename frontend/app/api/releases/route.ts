import { NextResponse } from "next/server";

const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/beastyrabbit/beastypage/releases";

export async function GET() {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`GitHub releases API returned ${res.status}`);
      return NextResponse.json({ error: "Failed to fetch releases" }, { status: 502 });
    }

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      console.error(`GitHub releases API returned non-array response: ${typeof raw}`);
      return NextResponse.json({ error: "Unexpected response format from GitHub" }, { status: 502 });
    }
    const items = raw;
    const releases = items.map((entry: unknown) => {
      const r = entry as Record<string, unknown>;
      return {
        tag: String(r.tag_name ?? ""),
        name: String(r.name ?? r.tag_name ?? ""),
        body: String(r.body ?? ""),
        publishedAt: String(r.published_at ?? ""),
        htmlUrl: String(r.html_url ?? ""),
      };
    });

    return NextResponse.json(releases, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (error) {
    console.error("Failed to fetch GitHub releases", error);
    return NextResponse.json({ error: "Failed to fetch releases" }, { status: 500 });
  }
}
