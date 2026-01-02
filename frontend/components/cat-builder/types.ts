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
  generateCat<T extends Record<string, unknown>>(params: T): Promise<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    imageDataUrl?: string | null;
    meta?: unknown;
  }>;
  generateRandomParams?<T extends Record<string, unknown>>(options?: T): Promise<Record<string, unknown>>;
  generateRandomCat?<T extends Record<string, unknown>>(options?: T): Promise<{
    params: Record<string, unknown>;
    canvas: HTMLCanvasElement | OffscreenCanvas;
  }>;
  buildCatURL?<T extends Record<string, unknown>>(params: T): string;
  generateVariantSheet?<T extends Record<string, unknown>>(
    baseParams: T,
    variants: { id: string; params: Record<string, unknown>; label?: string }[],
    options?: unknown
  ): Promise<unknown>;
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
