import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADDITIONAL_PALETTES } from "../lib/palettes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(
  __dirname,
  "../../backend/renderer_service/renderer_service/data/palettes",
);

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

async function readJsonIfPresent(filePath: string) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as unknown;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  await mkdir(outputDir, { recursive: true });

  let written = 0;
  let unchanged = 0;
  const drifted: string[] = [];

  for (const palette of ADDITIONAL_PALETTES) {
    const nextPayload = {
      id: palette.id,
      label: palette.label,
      description: palette.description,
      colors: palette.colors,
    };
    const filePath = path.join(outputDir, `${palette.id}.json`);
    const currentPayload = await readJsonIfPresent(filePath);
    const matches =
      currentPayload !== null &&
      stableStringify(currentPayload) === stableStringify(nextPayload);

    if (matches) {
      unchanged += 1;
      continue;
    }

    drifted.push(palette.id);
    if (checkOnly) continue;

    await writeFile(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
    written += 1;
  }

  if (checkOnly && drifted.length > 0) {
    console.error(
      `Renderer palette data drift detected for ${drifted.length} palette(s): ${drifted.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log(`Renderer palette data is in sync (${unchanged} palette files checked).`);
    return;
  }

  console.log(
    `Renderer palette sync complete: ${written} updated, ${unchanged} unchanged.`,
  );
}

await main();
