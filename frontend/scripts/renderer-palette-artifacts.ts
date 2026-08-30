import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADDITIONAL_PALETTES } from "../lib/palettes";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const rendererPaletteOutputDirectory = path.resolve(
  scriptDirectory,
  "../../backend/renderer_service/renderer_service/data/palettes",
);

export interface RendererPaletteSyncResult {
  expected: ReadonlyMap<string, string>;
  unchanged: string[];
  drifted: string[];
  extra: string[];
  written: string[];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
      )
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function canonicalizeRendererPalettePayload(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function buildRendererPalettePayloads(): ReadonlyMap<string, unknown> {
  const payloads = new Map<string, unknown>();
  for (const palette of ADDITIONAL_PALETTES) {
    if (!/^[a-z0-9-]+$/.test(palette.id)) {
      throw new Error(
        `Renderer palette ID is not a safe filename: ${palette.id}`,
      );
    }
    const filename = `${palette.id}.json`;
    if (payloads.has(filename)) {
      throw new Error(`Duplicate renderer palette ID: ${palette.id}`);
    }
    payloads.set(filename, {
      id: palette.id,
      label: palette.label,
      description: palette.description,
      colors: palette.colors,
    });
  }
  return new Map(
    [...payloads].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildRendererPaletteArtifacts(): ReadonlyMap<string, string> {
  return new Map(
    [...buildRendererPalettePayloads()].map(([filename, payload]) => [
      filename,
      `${JSON.stringify(payload, null, 2)}\n`,
    ]),
  );
}

function payloadMatchesFile(filePath: string, expected: unknown): boolean {
  try {
    return (
      canonicalizeRendererPalettePayload(
        JSON.parse(readFileSync(filePath, "utf8")),
      ) === canonicalizeRendererPalettePayload(expected)
    );
  } catch {
    return false;
  }
}

export function syncRendererPaletteArtifacts({
  checkOnly,
  outputDirectory = rendererPaletteOutputDirectory,
}: {
  checkOnly: boolean;
  outputDirectory?: string;
}): RendererPaletteSyncResult {
  const expectedPayloads = buildRendererPalettePayloads();
  const expected = buildRendererPaletteArtifacts();
  const unchanged: string[] = [];
  const drifted: string[] = [];
  const written: string[] = [];

  if (!checkOnly) mkdirSync(outputDirectory, { recursive: true });

  for (const [filename, content] of expected) {
    const filePath = path.join(outputDirectory, filename);
    if (
      existsSync(filePath) &&
      payloadMatchesFile(filePath, expectedPayloads.get(filename))
    ) {
      unchanged.push(filename);
      continue;
    }
    drifted.push(filename);
    if (!checkOnly) {
      writeFileSync(filePath, content, "utf8");
      written.push(filename);
    }
  }

  const extra = existsSync(outputDirectory)
    ? readdirSync(outputDirectory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".json") &&
            !expected.has(entry.name),
        )
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
    : [];

  return { expected, unchanged, drifted, extra, written };
}
