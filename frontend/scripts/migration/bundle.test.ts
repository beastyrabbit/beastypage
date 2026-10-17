// @vitest-environment node
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// The cutover runs these scripts as single-file bundles (docs/migration/
// cutover.md step 7). A bundle that pulls in another entry script also pulls
// in its `import.meta.filename === argv[1]` check, and both CLIs then run.
async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["pg-native", "sharp"],
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0]?.text ?? "";
}

describe("migration script bundles", () => {
  it("keeps the importer CLI out of the verify:import bundle", async () => {
    const verify = await bundle("scripts/migration/verify-import.ts");
    expect(verify).toContain("[verify:import] failed:");
    expect(verify).not.toContain("[import] failed:");
  });

  it("keeps the verify:import CLI out of the importer bundle", async () => {
    const importer = await bundle("scripts/migration/import-convex.ts");
    expect(importer).toContain("[import] failed:");
    expect(importer).not.toContain("[verify:import] failed:");
  });
});
