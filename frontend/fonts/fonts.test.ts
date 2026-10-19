// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";
import sources from "./sources.json";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

describe("self-hosted fonts", () => {
  it("keeps application sources independent of the Google Fonts loader and CDN", () => {
    const files = globSync("**/*.{ts,tsx,js,jsx,mjs,cjs,css}", {
      cwd: repositoryRoot,
      ignore: [
        "**/node_modules/**",
        "**/.next/**",
        "**/dist/**",
        "**/dist-db/**",
        "**/coverage/**",
        "**/*.test.*",
        "**/*.spec.*",
        ".playwright-mcp/**",
      ],
    });
    const remoteFontSources = files.filter((file) =>
      /next\/font\/google|https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(
        readFileSync(path.join(repositoryRoot, file), "utf8"),
      ),
    );
    expect(remoteFontSources).toEqual([]);
  });

  it("ships intact WOFF2 files and a redistribution license for every family", () => {
    expect(sources).toHaveLength(13);
    for (const source of sources) {
      const file = path.join(import.meta.dirname, source.file);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        source.sha256,
      );
      const licenseName = source.file.startsWith("specialelite/")
        ? "LICENSE.txt"
        : "OFL.txt";
      const license = readFileSync(
        path.join(path.dirname(file), licenseName),
        "utf8",
      );
      expect(license).toContain(
        licenseName === "OFL.txt" ? "SIL OPEN FONT LICENSE" : "Apache License",
      );
    }
  });

  it("keeps the two Latin preload files below 75 KB together", () => {
    const latinFonts = sources.filter((source) =>
      source.file.endsWith("-Latin.woff2"),
    );
    expect(latinFonts).toHaveLength(2);
    const bytes = latinFonts.reduce(
      (total, source) =>
        total +
        readFileSync(path.join(import.meta.dirname, source.file)).length,
      0,
    );
    expect(bytes).toBeLessThan(75_000);
  });
});
