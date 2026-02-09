import { config } from "../config.js";

const TIMEOUT_MS = 30_000;

interface CatOptions {
  sprite?: number;
  pelt?: string;
  colour?: string;
  shading?: boolean;
  eye_colour?: string;
  accessories?: number;
  scars?: number;
  torties?: number;
}

export interface CatResponse {
  image: string; // data:image/png;base64,...
  slug?: string;
  viewUrl?: string;
  params: {
    spriteNumber: number;
    peltName: string;
    colour: string;
    eyeColour: string;
    shading: boolean;
    isTortie: boolean;
    accessories?: (string | null)[];
    scars?: (string | null)[];
    tortie?: { mask?: string; pattern?: string; colour?: string }[];
    darkForest?: boolean;
    source: string;
  };
}

export interface PaletteColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  /** Percentage 0-100 */
  prevalence: number;
}

export interface PaletteResponse {
  paletteImage: string; // data:image/png;base64,...
  colors: PaletteColor[];
  customizeUrl: string;
  slug?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(unable to read response body)";
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
    const text = await readErrorBody(res);
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
    const text = await readErrorBody(res);
    throw new Error(`palette API error ${res.status}: ${text}`);
  }

  return (await res.json()) as PaletteResponse;
}
