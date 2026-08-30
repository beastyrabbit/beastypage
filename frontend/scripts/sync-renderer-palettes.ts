import { syncRendererPaletteArtifacts } from "./renderer-palette-artifacts";

function main() {
  const checkOnly = process.argv.includes("--check");
  const result = syncRendererPaletteArtifacts({ checkOnly });

  if (result.extra.length > 0) {
    console.error(
      `Unexpected renderer palette files must be removed explicitly: ${result.extra.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (checkOnly && result.drifted.length > 0) {
    console.error(
      `Renderer palette data drift detected for ${result.drifted.length} palette(s): ${result.drifted.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log(
      `Renderer palette data is in sync (${result.unchanged.length} palette files checked).`,
    );
    return;
  }

  console.log(
    `Renderer palette sync complete: ${result.written.length} updated, ${result.unchanged.length} unchanged.`,
  );
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
