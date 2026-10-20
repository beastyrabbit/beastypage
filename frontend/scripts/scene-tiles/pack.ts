// Copies rendered tile sheets into public/scene-planner/tiles/ and writes
// tiles.json, the index the Scene Planner loads.
//   pnpm exec tsx scripts/scene-tiles/pack.ts

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TileIndex, TileSheet } from "../../lib/scene-planner/tileset";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "out", "sheets");
const target = join(here, "..", "..", "public", "scene-planner", "tiles");

if (!existsSync(source)) {
  console.error(`No sheets in ${source}; run render.mjs first.`);
  process.exit(1);
}

// The pack replaces the whole published index, so every sheet must hold every
// tile the manifest lists; a `run.py --key` debug render does not.
const manifest = JSON.parse(
  readFileSync(join(here, "out", "manifest.json"), "utf8"),
) as { jobs: { sheet: string; key: string }[] };
const staged = (sheet: string) => {
  const file = join(source, `${sheet}.json`);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")).tiles as Record<string, unknown>)
    : {};
};
const incomplete = [...new Set(manifest.jobs.map((j) => j.sheet))].filter(
  (sheet) => {
    const tiles = staged(sheet);
    return manifest.jobs.some((j) => j.sheet === sheet && !(j.key in tiles));
  },
);
if (incomplete.length > 0) {
  console.error(
    `Not packing: ${incomplete.length} sheets are missing or incomplete ` +
      `(${incomplete.slice(0, 5).join(", ")}). Render them in full first.`,
  );
  process.exit(1);
}
mkdirSync(target, { recursive: true });

const hash = createHash("sha256");
const sheets: Record<string, TileSheet> = {};
for (const name of readdirSync(source)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const entry = JSON.parse(readFileSync(join(source, name), "utf8"));
  for (const file of [entry.file, entry.glow].filter(Boolean)) {
    const bytes = readFileSync(join(source, file));
    hash.update(bytes);
    copyFileSync(join(source, file), join(target, file));
  }
  sheets[entry.sheet] = {
    file: entry.file,
    glow: entry.glow,
    columns: entry.columns,
    tiles: entry.tiles,
  };
}

const index: TileIndex = {
  cell: 16,
  version: hash.digest("hex").slice(0, 12),
  sheets,
};
writeFileSync(join(target, "tiles.json"), JSON.stringify(index));
const count = Object.values(sheets).reduce(
  (sum, s) => sum + Object.keys(s.tiles).length,
  0,
);
console.log(
  `Packed ${Object.keys(sheets).length} sheets, ${count} tiles → ${target}`,
);
