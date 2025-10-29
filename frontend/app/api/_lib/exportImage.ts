import { promises as fs } from "fs";
import path from "path";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif"
};

export async function serveExportedImage(root: string, segments: string[]): Promise<Response> {
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response("Not Found", { status: 404 });
  }

  const safeSegments = segments.filter(Boolean).map((segment) => segment.replace(/\\/g, "/"));
  const joined = path.join(root, ...safeSegments);
  const normalized = path.normalize(joined);

  if (!normalized.startsWith(root)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(normalized);
    const ext = path.extname(normalized).slice(1).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable"
      }
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return new Response("Not Found", { status: 404 });
    }
    console.error("Failed to read exported image", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
