import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The container runs `node --experimental-strip-types src/index.ts`. Node's
 * strip-only mode rejects TypeScript that needs a transform (constructor
 * parameter properties, enums, namespaces, decorators), and neither tsc
 * nor vitest's transpiler notices. Strip every source file the way the
 * runtime does so such a file fails here instead of at pod start.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

describe("sources run under node --experimental-strip-types", () => {
	const root = join(import.meta.dirname, "..", "src");
	for (const file of sourceFiles(root)) {
		it(`strips ${file.slice(root.length + 1)}`, async () => {
			const { stripTypeScriptTypes } = await import("node:module");
			expect(() =>
				stripTypeScriptTypes(readFileSync(file, "utf8"), { mode: "strip" }),
			).not.toThrow();
		});
	}
});
