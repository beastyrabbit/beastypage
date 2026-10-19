// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import sources from "./sources.json";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

describe("self-hosted fonts", () => {
  it("uses valid CSS identifiers or quoted strings for fallback families", () => {
    const fontFiles = globSync("app/**/*.{ts,tsx}", {
      cwd: path.resolve(import.meta.dirname, ".."),
    }).filter((file) =>
      readFileSync(
        path.resolve(import.meta.dirname, "..", file),
        "utf8",
      ).includes('from "next/font/local"'),
    );
    let checked = 0;
    for (const file of fontFiles) {
      const source = ts.createSourceFile(
        file,
        readFileSync(path.resolve(import.meta.dirname, "..", file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === "fallback" &&
          ts.isArrayLiteralExpression(node.initializer)
        ) {
          for (const entry of node.initializer.elements) {
            expect(ts.isStringLiteral(entry)).toBe(true);
            if (!ts.isStringLiteral(entry)) continue;
            const family = entry.text;
            const quoted = /^(['"])[^'"\n]+\1$/.test(family);
            const identifiers = family
              .split(/\s+/)
              .every((word) => /^-?[_a-z][-_a-z0-9]*$/i.test(word));
            expect(quoted || identifiers, `${file}: ${family}`).toBe(true);
            checked++;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(checked).toBeGreaterThan(0);
  });

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
