import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { paletteGeneratorConfig } from "../db/contracts";
import type { Database } from "../db/pool";
import { paletteGeneratorSettings } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { storeCatDataUrl } from "./cat-files";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function slug() {
  let result = "";
  for (let i = 0; i < 7; i++) result += ALPHABET[randomInt(ALPHABET.length)];
  return result;
}

function validToken(actual: string) {
  const expected = (process.env.DISCORD_API_TOKEN ?? "").trim();
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return (
    expected.length >= 32 && a.length === b.length && timingSafeEqual(a, b)
  );
}

export async function getPalette(db: Database, slugValue: string) {
  const [row] = await db
    .select()
    .from(paletteGeneratorSettings)
    .where(eq(paletteGeneratorSettings.slug, slugValue))
    .limit(1);
  if (!row) return null;
  return {
    slug: row.slug,
    config: row.config,
    id: row.id,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function getPaletteImageUrl(db: Database, slugValue: string) {
  const [row] = await db
    .select({ imageFileId: paletteGeneratorSettings.imageFileId })
    .from(paletteGeneratorSettings)
    .where(eq(paletteGeneratorSettings.slug, slugValue))
    .limit(1);
  return row?.imageFileId ? `/api/files/${row.imageFileId}` : null;
}

export async function storeDiscordImage(
  db: Database,
  args: { dataUrl: string; colors: unknown; serviceToken: string },
) {
  if (!validToken(args.serviceToken))
    throw new ServiceError("forbidden", "Unauthorized service request");
  if (!Array.isArray(args.colors) || args.colors.length > 24)
    throw new ServiceError("invalid_input", "Too many palette colors");
  const encoded = JSON.stringify(args.colors);
  if (!encoded || new TextEncoder().encode(encoded).byteLength > 64 * 1024)
    throw new ServiceError("invalid_input", "Too many palette colors");
  const parsed = paletteGeneratorConfig.safeParse({
    source: "discord",
    colors: args.colors,
  });
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid palette colors");
  const file = await storeCatDataUrl(db, args.dataUrl);
  return withTransaction(db, async (tx) => {
    let chosen = "";
    for (let i = 0; i < 6; i++) {
      const candidate = slug();
      const [existing] = await tx
        .select({ id: paletteGeneratorSettings.id })
        .from(paletteGeneratorSettings)
        .where(eq(paletteGeneratorSettings.slug, candidate))
        .limit(1);
      if (!existing) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen)
      throw new ServiceError(
        "conflict",
        "Failed to generate unique settings slug",
      );
    const [row] = await tx
      .insert(paletteGeneratorSettings)
      .values({ slug: chosen, config: parsed.data, imageFileId: file.id })
      .returning({ id: paletteGeneratorSettings.id });
    if (!row)
      throw new ServiceError("unavailable", "Failed to store palette image");
    return { slug: chosen, storageId: file.id };
  });
}
