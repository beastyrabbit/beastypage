import { config } from "../config.js";

const TIMEOUT_MS = 30_000;

interface CatOptions {
  sprite?: number;
  pelt?: string;
  colour?: string;
  shading?: boolean;
  eye_colour?: string;
  discord_user_id?: string;
  discord_username?: string;
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
    dead?: boolean;
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

export interface UserConfig {
  discordUserId: string;
  accessoriesMin: number;
  accessoriesMax: number;
  scarsMin: number;
  scarsMax: number;
  tortiesMin: number;
  tortiesMax: number;
  darkForest: boolean;
  starclan: boolean;
  palettes: string[];
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

export async function getUserConfig(
  discordUserId: string
): Promise<UserConfig> {
  const url = `${config.frontendApiUrl}/api/discord/user-config?discordUserId=${encodeURIComponent(discordUserId)}`;
  const res = await fetchWithTimeout(url, { method: "GET" });

  if (!res.ok) {
    const text = await readErrorBody(res);
    throw new Error(`user-config GET error ${res.status}: ${text}`);
  }

  return (await res.json()) as UserConfig;
}

export async function updateUserConfig(
  payload: Record<string, unknown>
): Promise<void> {
  const url = `${config.frontendApiUrl}/api/discord/user-config`;
  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await readErrorBody(res);
    throw new Error(`user-config PATCH error ${res.status}: ${text}`);
  }
}
