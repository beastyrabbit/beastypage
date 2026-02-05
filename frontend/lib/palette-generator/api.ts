import { FALLBACK_PALETTES, type GeneratedPalette } from "./types";

export function randomHexSeed(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
}

export async function fetchPaletteFromAPI(
  mode: string,
  count: number,
): Promise<GeneratedPalette> {
  const seed = randomHexSeed();
  // The Color API uses "quad" for four-hue schemes; alias common synonyms
  const safeMode = mode === "tetrad" || mode === "square" ? "quad" : mode;
  const url = `https://www.thecolorapi.com/scheme?hex=${seed}&mode=${encodeURIComponent(safeMode)}&count=${count}`;
  const started = performance.now();

  function buildPalette(colors: string[], source: "colorapi" | "fallback"): GeneratedPalette {
    return {
      id: crypto.randomUUID(),
      seed,
      mode,
      colors,
      ms: Math.round(performance.now() - started),
      source,
      timestamp: Date.now(),
    };
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Color API error ${res.status}`);

    const data: { colors?: { hex?: { value?: string } }[] } = await res.json();
    const colors: string[] = Array.isArray(data.colors)
      ? data.colors
          .map((entry) => entry.hex?.value)
          .filter((value): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value))
      : [];
    if (!colors.length) throw new Error("No colors returned");

    return buildPalette(colors.slice(0, count), "colorapi");
  } catch (error) {
    console.error("[PaletteGenerator] API fetch failed, using fallback palette", error);
    const fallback =
      FALLBACK_PALETTES[Math.floor(Math.random() * FALLBACK_PALETTES.length)];
    return buildPalette(fallback.slice(0, count), "fallback");
  }
}
