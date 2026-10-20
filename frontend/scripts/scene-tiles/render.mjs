// Renders every Scene Planner tile sheet in parallel Blender processes, then
// packs them into public/scene-planner/tiles/.
//
//   pnpm exec tsx scripts/scene-tiles/manifest.ts
//   node scripts/scene-tiles/render.mjs [--jobs 6] [--threads 3] [sheet ...]
//
// BLENDER overrides the Blender binary, for example on macOS:
//   BLENDER=/Applications/Blender.app/Contents/MacOS/Blender node ...

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return Number(value);
};
const jobs = option("--jobs", 6);
const threads = option("--threads", 3);
const blender = process.env.BLENDER ?? "blender";

const manifest = JSON.parse(
  readFileSync(join(here, "out", "manifest.json"), "utf8"),
);
const all = [...new Set(manifest.jobs.map((j) => j.sheet))];
// Biggest sheets first so the pool finishes together.
const size = (sheet) =>
  manifest.jobs
    .filter((j) => j.sheet === sheet)
    .reduce((sum, j) => sum + j.frames, 0);
const queue = (args.length > 0 ? args : all).sort((a, b) => size(b) - size(a));

const failed = [];
const started = Date.now();

function run(sheet) {
  return new Promise((resolve) => {
    const child = spawn(
      blender,
      [
        "-b",
        "--factory-startup",
        "-P",
        join(here, "run.py"),
        "--",
        "--sheet",
        sheet,
        "--threads",
        String(threads),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    const keep = (chunk) => {
      log += chunk;
      for (const line of String(chunk).split("\n"))
        if (line.startsWith(`[${sheet}]`)) console.log(line);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      if (code !== 0) {
        failed.push(sheet);
        console.log(log.split("\n").slice(-30).join("\n"));
      }
      resolve();
    });
  });
}

async function worker() {
  for (let sheet = queue.shift(); sheet; sheet = queue.shift())
    await run(sheet);
}

await Promise.all(Array.from({ length: jobs }, worker));
console.log(
  `Rendered in ${Math.round((Date.now() - started) / 1000)}s` +
    (failed.length ? `; failed: ${failed.join(", ")}` : ""),
);

await new Promise((resolve) => {
  const pack = spawn("pnpm", ["exec", "tsx", join(here, "pack.ts")], {
    stdio: "inherit",
  });
  pack.on("close", resolve);
});
process.exit(failed.length ? 1 : 0);
