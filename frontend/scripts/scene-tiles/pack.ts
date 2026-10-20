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
