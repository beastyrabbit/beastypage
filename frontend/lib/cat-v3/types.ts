export interface CatRenderParams {
  spriteNumber: number;
  params: Record<string, unknown>;
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
  overrides?: Record<string, unknown>;
  params?: Record<string, unknown>;
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
