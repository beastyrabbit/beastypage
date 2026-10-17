import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "../db/pool";
import { ServiceError } from "../errors";
import { storeCatDataUrl } from "./cat-files";
import { applyPreviewUpdates, getPreviewRefs } from "./cats";

function constantTimeEqual(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertAdminToken(token: string) {
  const expected = process.env.PREVIEW_REFRESH_TOKEN?.trim();
  if (!expected || !constantTimeEqual(token, expected))
    throw new ServiceError(
      "forbidden",
      "Not authorized to update mapper previews",
    );
}

export type PreviewUpdateInput = {
  id: string;
  adminToken?: string;
  tiny?: { dataUrl: string; filename?: string };
  preview?: { dataUrl: string; filename?: string };
  full?: { dataUrl: string; filename?: string };
  spriteSheet?: { dataUrl: string; filename?: string; meta?: unknown };
};

export async function upsertMapperPreviews(
  db: Database,
  args: PreviewUpdateInput,
) {
  assertAdminToken(args.adminToken ?? "");
  const existing = await getPreviewRefs(db, args.id);
  if (existing === null)
    throw new ServiceError("not_found", "Mapper record not found");
  const images: Record<
    string,
    { fileId: string; filename?: string; meta?: unknown }
  > = {};
  for (const kind of ["tiny", "preview", "full", "spriteSheet"] as const) {
    const payload = args[kind];
    if (!payload) continue;
    const file = await storeCatDataUrl(db, payload.dataUrl);
    images[kind] = {
      fileId: file.id,
      filename: payload.filename,
      meta:
        kind === "spriteSheet" && "meta" in payload ? payload.meta : undefined,
    };
  }
  return applyPreviewUpdates(db, {
    id: args.id,
    previewsUpdatedAt: Date.now(),
    images,
  });
}
