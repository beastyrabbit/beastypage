import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRendererPaletteArtifacts,
  syncRendererPaletteArtifacts,
} from "../../../scripts/renderer-palette-artifacts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("renderer palette artifacts", () => {
  it("detects content and extra-file drift without treating formatting as drift", () => {
    const outputDirectory = mkdtempSync(
      path.join(tmpdir(), "beastypage-renderer-palettes-"),
    );
    temporaryDirectories.push(outputDirectory);

    const generated = syncRendererPaletteArtifacts({
      checkOnly: false,
      outputDirectory,
    });
    expect(generated.written).toHaveLength(
      buildRendererPaletteArtifacts().size,
    );

    const filename = generated.written[0];
    if (!filename)
      throw new Error("No renderer palette artifact was generated");
    const palettePath = path.join(outputDirectory, filename);
    const payload = JSON.parse(readFileSync(palettePath, "utf8"));
    writeFileSync(palettePath, JSON.stringify(payload), "utf8");
    const extraPath = path.join(outputDirectory, "stale-palette.json");
    writeFileSync(extraPath, "{}\n", "utf8");

    const reformatted = syncRendererPaletteArtifacts({
      checkOnly: true,
      outputDirectory,
    });
    expect(reformatted.drifted).not.toContain(filename);
    expect(reformatted.extra).toEqual(["stale-palette.json"]);
    expect(existsSync(extraPath)).toBe(true);

    payload.label = `${String(payload.label)} drift`;
    writeFileSync(palettePath, JSON.stringify(payload), "utf8");
    const changed = syncRendererPaletteArtifacts({
      checkOnly: true,
      outputDirectory,
    });
    expect(changed.drifted).toContain(filename);
    expect(existsSync(extraPath)).toBe(true);
  });
});
