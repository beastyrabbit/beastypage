export interface GeneratedPalette {
  id: string;
  colors: string[];
  seed: string;
  mode: string;
  ms: number;
  source: "colorapi" | "fallback";
  timestamp: number;
}

export type DisplayFormat = "hex" | "rgb" | "hsl" | "hsv" | "cmyk" | "oklch";

export type ExportFormat = "png" | "aco" | "json" | "css";

export const DISPLAY_FORMATS: DisplayFormat[] = ["hex", "rgb", "hsl", "hsv", "cmyk", "oklch"];

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

// Curated fallback palettes used when the Color API is unreachable.
// One is chosen at random and sliced to the requested count.
export const FALLBACK_PALETTES = [
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"],
  ["#1F2041", "#4B3F72", "#FFC857", "#119DA4", "#19647E"],
  ["#2B193D", "#3E1F47", "#A49E8D", "#EFD9CE", "#F9F5E3"],
];
