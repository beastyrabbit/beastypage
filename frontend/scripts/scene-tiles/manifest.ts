// Writes the Scene Planner tile list for the Blender run:
//   pnpm exec tsx scripts/scene-tiles/manifest.ts
// Output: scripts/scene-tiles/out/manifest.json

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ELEMENTS_BY_ID } from "../../lib/scene-planner/catalog";
import { MATERIALS } from "../../lib/scene-planner/tiles";
import { COMBOS, TILE_SPECS, tileJobs } from "../../lib/scene-planner/tileset";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out", "manifest.json");

const jobs = tileJobs();
const elements = Object.fromEntries(
  Object.entries(TILE_SPECS).map(([id, spec]) => {
    const element = ELEMENTS_BY_ID.get(id);
    return [
      id,
      {
        ...spec,
        label: element?.label,
        zones: element?.zones,
        shape: element?.shape,
        color: element?.color,
        material: MATERIALS[id],
      },
    ];
  }),
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ cell: 16, elements, combos: COMBOS, jobs }, null, 1),
);

const frames = jobs.reduce((sum, job) => sum + job.frames, 0);
console.log(`${jobs.length} tiles, ${frames} frames → ${out}`);
for (const sheet of new Set(jobs.map((j) => j.sheet))) {
  const own = jobs.filter((j) => j.sheet === sheet);
  console.log(`  ${sheet.padEnd(12)} ${own.length}`);
}
