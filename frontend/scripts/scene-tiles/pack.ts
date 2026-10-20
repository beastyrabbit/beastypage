// Validates and stages a complete set before replacing the published directory.
//   pnpm exec tsx scripts/scene-tiles/pack.ts

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import type { TileIndex, TileSheet } from "../../lib/scene-planner/tileset";

const here = dirname(fileURLToPath(import.meta.url));

interface PackPaths {
  source: string;
  target: string;
  manifest: string;
}

interface SheetEntry extends TileSheet {
  sheet: string;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateEntry(entry: SheetEntry): void {
  if (
    typeof entry.sheet !== "string" ||
    !Number.isSafeInteger(entry.columns) ||
    entry.columns <= 0 ||
    !entry.tiles ||
    typeof entry.tiles !== "object" ||
    Array.isArray(entry.tiles)
  ) {
    throw new Error("Invalid sheet metadata.");
  }
  for (const tile of Object.values(entry.tiles)) {
    if (
      !Array.isArray(tile) ||
      tile.length !== 2 ||
      !Number.isSafeInteger(tile[0]) ||
      tile[0] < 0 ||
      !Number.isSafeInteger(tile[1]) ||
      tile[1] <= 0 ||
      tile[1] > entry.columns
    ) {
      throw new Error(`Invalid row or frame count in ${entry.sheet}.`);
    }
  }
}

async function readImage(source: string, file: string, entry: SheetEntry) {
  if (
    typeof file !== "string" ||
    basename(file) !== file ||
    !file.endsWith(".png")
  ) {
    throw new Error(`Invalid PNG filename in ${entry.sheet}.`);
  }
  const bytes = readFileSync(join(source, file));
  const image = sharp(bytes, { failOn: "warning" });
  const metadata = await image.metadata();
  const height = metadata.height ?? 0;
  if (
    metadata.format !== "png" ||
    metadata.width !== entry.columns * 16 ||
    Object.values(entry.tiles).some(([row]) => (row + 1) * 16 > height)
  ) {
    throw new Error(`Invalid PNG dimensions for ${file}.`);
  }
  // Decode as well: a readable header alone does not prove the PNG is intact.
  await image.raw().toBuffer();
  return bytes;
}

async function preflight(paths: PackPaths) {
  const manifest = readJson(paths.manifest) as {
    jobs: { sheet: string; key: string; frames: number }[];
  };
  if (!Array.isArray(manifest.jobs) || manifest.jobs.length === 0) {
    throw new Error("The manifest has no jobs.");
  }
  const entries = readdirSync(paths.source)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson(join(paths.source, name)) as SheetEntry);
  const sheets: Record<string, TileSheet> = Object.create(null);
  const images = new Map<string, Buffer>();
  const hash = createHash("sha256");
  for (const entry of entries) {
    validateEntry(entry);
    if (Object.hasOwn(sheets, entry.sheet)) {
      throw new Error(`Duplicate sheet ${entry.sheet}.`);
    }
    const files = [entry.file];
    if (entry.glow !== undefined) files.push(entry.glow);
    for (const file of files) {
      const bytes = await readImage(paths.source, file, entry);
      images.set(file, bytes);
      hash.update(bytes);
    }
    sheets[entry.sheet] = {
      file: entry.file,
      glow: entry.glow,
      columns: entry.columns,
      tiles: entry.tiles,
    };
  }
  for (const job of manifest.jobs) {
    if (sheets[job.sheet]?.tiles[job.key]?.[1] !== job.frames) {
      throw new Error(
        `Missing or incomplete tile ${job.sheet}/${job.key}. Render it in full first.`,
      );
    }
  }
  const index: TileIndex = {
    cell: 16,
    version: hash.digest("hex").slice(0, 12),
    sheets,
  };
  return { index, images };
}

function publish(
  target: string,
  index: TileIndex,
  images: Map<string, Buffer>,
): void {
  mkdirSync(dirname(target), { recursive: true });
  const temporary = mkdtempSync(join(dirname(target), ".tiles-"));
  const staged = join(temporary, "staged");
  const previous = join(temporary, "previous");
  let installed = false;
  try {
    mkdirSync(staged);
    for (const [file, bytes] of images)
      writeFileSync(join(staged, file), bytes);
    writeFileSync(join(staged, "tiles.json"), JSON.stringify(index));
    if (existsSync(target)) renameSync(target, previous);
    try {
      renameSync(staged, target);
      installed = true;
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, target);
      throw error;
    }
  } finally {
    // If restoring also fails, retain the backup for manual recovery.
    if (installed || !existsSync(previous)) {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

export async function packTiles(paths: PackPaths): Promise<TileIndex> {
  const { index, images } = await preflight(paths);
  publish(paths.target, index, images);
  return index;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const target = resolve(
    process.env.SCENE_TILES_TARGET ??
      join(here, "..", "..", "public", "scene-planner", "tiles"),
  );
  packTiles({
    source: resolve(
      process.env.SCENE_TILES_SOURCE ?? join(here, "out", "sheets"),
    ),
    target,
    manifest: resolve(
      process.env.SCENE_TILES_MANIFEST ?? join(here, "out", "manifest.json"),
    ),
  })
    .then((index) => {
      const count = Object.values(index.sheets).reduce(
        (sum, sheet) => sum + Object.keys(sheet.tiles).length,
        0,
      );
      console.log(
        `Packed ${Object.keys(index.sheets).length} sheets, ${count} tiles → ${target}`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
