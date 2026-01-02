import type { CatParams, RandomGenerationOptions, BatchRenderResponse } from '@/lib/cat-v3/types';

export interface SpriteMapperApi {
  loaded: boolean;
  init(): Promise<boolean>;
  getSprites(): number[];
  getPeltNames(): string[];
  getColourOptions(mode?: unknown): string[];
  getExperimentalColoursByMode?(mode: string): string[];
  getColours(): string[];
  getEyeColours(): string[];
  getSkinColours(): string[];
  getWhitePatches(): string[];
  getWhitePatchColourOptions(mode?: string, experimentalMode?: unknown): string[];
  getWhiteTints(): string[];
  getPoints(): string[];
  getVitiligo(): string[];
  getTints(): string[];
  getTortieMasks(): string[];
  getPlantAccessories(): string[];
  getWildAccessories(): string[];
  getCollars(): string[];
  getAccessories?(): string[];
  getScarsByCategory(category: number): string[];
  getExperimentalColourDefinition?(name: string): { multiply?: number[] } | null;
  getColourDefinition?(name: string): { multiply?: number[] } | null;
  isExperimentalColour?(name: string): boolean;
}

export interface CatGeneratorApi {
  generateCat(params: Partial<CatParams> | CatParams): Promise<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    imageDataUrl?: string | null;
    meta?: unknown;
  }>;
  generateRandomParams?(options?: RandomGenerationOptions): Promise<CatParams>;
  generateRandomCat?(options?: RandomGenerationOptions): Promise<{
    params: CatParams;
    canvas: HTMLCanvasElement | OffscreenCanvas;
  }>;
  buildCatURL?(params: Partial<CatParams> | CatParams): string;
  generateVariantSheet?(
    baseParams: Partial<CatParams> | CatParams,
    variants: { id: string; params: Partial<CatParams>; label?: string; group?: string }[],
    options?: unknown
  ): Promise<BatchRenderResponse>;
}

export interface BuilderOptions {
  sprites: number[];
  pelts: string[];
  points: string[];
  vitiligo: string[];
  whitePatches: string[];
  eyeColours: string[];
  skinColours: string[];
  tints: string[];
  whiteTints: string[];
  tortieMasks: string[];
  plantAccessories: string[];
  wildAccessories: string[];
  collarAccessories: string[];
  scarBattle: string[];
  scarMissing: string[];
  scarEnvironmental: string[];
}

export const FORBIDDEN_SPRITES = new Set([0, 1, 2, 3, 4, 19, 20]);
