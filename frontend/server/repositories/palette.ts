import "server-only";

import { eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { paletteGeneratorSettings } from "../db/schema";

export type PaletteTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type PaletteDb = Database | PaletteTx;

export async function findPalette(db: PaletteDb, slug: string) {
  const [row] = await db
    .select()
    .from(paletteGeneratorSettings)
    .where(eq(paletteGeneratorSettings.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function findPaletteImage(db: PaletteDb, slug: string) {
  const [row] = await db
    .select({ imageFileId: paletteGeneratorSettings.imageFileId })
    .from(paletteGeneratorSettings)
    .where(eq(paletteGeneratorSettings.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function findUniquePaletteSlug(tx: PaletteTx, slug: string) {
  const [row] = await tx
    .select({ id: paletteGeneratorSettings.id })
    .from(paletteGeneratorSettings)
    .where(eq(paletteGeneratorSettings.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function insertPalette(
  tx: PaletteTx,
  values: typeof paletteGeneratorSettings.$inferInsert,
) {
  const [row] = await tx
    .insert(paletteGeneratorSettings)
    .values(values)
    .returning({ id: paletteGeneratorSettings.id });
  return row ?? null;
}
