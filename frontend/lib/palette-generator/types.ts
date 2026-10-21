export interface GeneratedPalette {
  id: string;
  colors: string[];
  seed: string;
  mode: string;
  ms: number;
  source: "local" | "colorapi" | "fallback"; // Legacy sources remain valid in saved collections.
  timestamp: number;
}

export type DisplayFormat = "hex" | "rgb" | "hsl" | "hsv" | "cmyk" | "oklch";

export type ExportFormat = "png" | "aco" | "json" | "css";

export const DISPLAY_FORMATS: DisplayFormat[] = [
  "hex",
  "rgb",
  "hsl",
  "hsv",
  "cmyk",
  "oklch",
];

export const MODE_OPTIONS: { key: string; label: string }[] = [
  { key: "monochrome", label: "Monochrome" },
  { key: "monochrome-dark", label: "Mono Dark" },
  { key: "monochrome-light", label: "Mono Light" },
  { key: "analogic", label: "Analogic" },
  { key: "complement", label: "Complement" },
  { key: "analogic-complement", label: "Analogic+Comp" },
  { key: "triad", label: "Triad" },
  { key: "quad", label: "Quad" },
];
