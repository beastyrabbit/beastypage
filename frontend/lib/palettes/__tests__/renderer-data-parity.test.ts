import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADDITIONAL_PALETTES } from "@/lib/palettes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererPaletteDir = path.resolve(
  __dirname,
  "../../../../backend/renderer_service/renderer_service/data/palettes",
);

describe("renderer palette data parity", () => {
  it("keeps renderer JSON palettes aligned with frontend definitions", () => {
    const mismatches: string[] = [];

    for (const palette of ADDITIONAL_PALETTES) {
      const filePath = path.join(rendererPaletteDir, `${palette.id}.json`);
      if (!existsSync(filePath)) {
        mismatches.push(`${palette.id} (missing)`);
        continue;
      }

      const actual = JSON.parse(readFileSync(filePath, "utf8"));
      const expected = {
        id: palette.id,
        label: palette.label,
        description: palette.description,
        colors: palette.colors,
      };

      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${palette.id} (content mismatch)`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
