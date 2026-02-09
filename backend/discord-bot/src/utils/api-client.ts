import { config } from "../config.js";

const TIMEOUT_MS = 30_000;

interface CatOptions {
  sprite?: number;
  pelt?: string;
  colour?: string;
  shading?: boolean;
  tortie?: boolean;
}

export interface CatResponse {
  image: string; // data:image/png;base64,...
  slug?: string;
  viewUrl?: string;
  params: {
    spriteNumber: number;
    peltName: string;
    colour: string;
    shading: boolean;
    isTortie: boolean;
    source: string;
    [key: string]: unknown;
  };
}

export interface PaletteColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  prevalence: number;
}

export interface PaletteResponse {
  paletteImage: string; // data:image/png;base64,...
  colors: PaletteColor[];
  customizeUrl: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCat(options: CatOptions): Promise<CatResponse> {
  const url = `${config.frontendApiUrl}/api/discord/random-cat`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`random-cat API error ${res.status}: ${text}`);
  }

  return (await res.json()) as CatResponse;
}

export async function extractPalette(
  imageUrl: string,
  colors?: number
): Promise<PaletteResponse> {
  const url = `${config.frontendApiUrl}/api/discord/palette`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, colors }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`palette API error ${res.status}: ${text}`);
  }

  return (await res.json()) as PaletteResponse;
}
