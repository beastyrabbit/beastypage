export interface TortieLayer {
  pattern?: string;
  colour?: string;
  mask?: string;
}

export interface CatParams {
  spriteNumber: number;
  peltName: string;
  colour: string;
  isTortie: boolean;
  tortiePattern?: string;
  tortieColour?: string;
  tortieMask?: string;
  tortie?: (TortieLayer | null)[];
  eyeColour: string;
  eyeColour2?: string;
  skinColour: string;
  whitePatches?: string;
  whitePatchesTint?: string;
  points?: string;
  vitiligo?: string;
  tint?: string;
  shading: boolean;
  reverse: boolean;
  accessory?: string;
  accessories?: (string | null)[];
  scar?: string;
  scars?: (string | null)[];
  basePalette?: string;
  experimentalColourMode?: string;
  tortiePalette?: string;
  darkForest?: boolean;
}

export interface RandomGenerationOptions {
  ignoreForbiddenSprites?: boolean;
  experimentalColourMode?: string | string[];
  includeBaseColours?: boolean;
  countsMode?:
    | 'weighted'
    | 'uniform'
    | Partial<Record<'tortie' | 'accessories' | 'scars', 'weighted' | 'uniform'>>;
  slotOverrides?: Partial<Record<'tortie' | 'accessories' | 'scars', number>>;
  whitePatchColourMode?: string;
}

export interface CatRenderParams {
  spriteNumber: number;
  params: Omit<CatParams, 'spriteNumber'>;
  collectLayers?: boolean;
  includeLayerImages?: boolean;
}

export interface RenderLayerDiagnostic {
  id: string;
  label: string;
  duration_ms: number;
  diagnostics: string[];
  blendMode?: string | null;
  imageDataUrl?: string | null;
}

export interface RenderMeta {
  started_at: number;
  finished_at: number;
  duration_ms: number;
  memory_pressure: boolean;
}

export interface RendererResponse {
  imageDataUrl: string;
  meta: RenderMeta;
  layers?: RenderLayerDiagnostic[];
}

export interface SpritesheetFrameMeta {
  id: string;
  label?: string | null;
  group?: string | null;
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BatchFrameSource {
  id: string;
  imageDataUrl: string;
}

export interface BatchRenderResponse {
  sheetDataUrl: string;
  width: number;
  height: number;
  tileSize: number;
  frames: SpritesheetFrameMeta[];
  sources?: BatchFrameSource[];
}

export interface BatchVariantPayload {
  id: string;
  label?: string;
  group?: string;
  spriteNumber?: number;
  overrides?: Partial<CatParams>;
  params?: Partial<CatParams>;
}

export interface BatchRenderOptions {
  tileSize?: number;
  columns?: number;
  includeSources?: boolean;
  includeBase?: boolean;
  frameMode?: "composed" | "layer";
  layerId?: string;
}

export interface BatchRenderRequest {
  payload: CatRenderParams;
  variants?: BatchVariantPayload[];
  options?: BatchRenderOptions;
}
