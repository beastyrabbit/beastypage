import type { JsonValue } from "@/lib/cat-system/definition";
import type {
  GachaCountsMode,
  GachaSeed,
  GachaSlotOverrides,
} from "@/lib/cat-system/gacha/types";
import type { CatDocument, CatTraits } from "@/lib/cat-system/runtime";

export interface TortieLayer {
  pattern?: string;
  colour?: string;
  mask?: string;
}

export interface CatParams {
  /** Canonical system envelope. Legacy flat fields remain during rollback-safe rollout. */
  schemaVersion?: number;
  traits?: Partial<CatTraits> & Record<string, unknown>;
  unknownTraits?: Record<string, JsonValue>;
  spriteNumber: number;
  poseName?: string;
  peltName: string;
  coatPattern?: string;
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
  darkMode?: boolean;
  dead?: boolean;
}

export interface RandomGenerationOptions {
  seed?: GachaSeed;
  /**
   * @deprecated Legacy numeric-sprite flag retained for older callers. All
   * renderable poses are now available.
   */
  ignoreForbiddenSprites?: boolean;
  experimentalColourMode?: string | string[];
  includeBaseColours?: boolean;
  /** @deprecated Retained for saved-setting compatibility and otherwise ignored. */
  includeNewSprites?: boolean;
  exactLayerCounts?: boolean;
  countsMode?: GachaCountsMode;
  slotOverrides?: GachaSlotOverrides;
  whitePatchColourMode?: string;
  // Legacy count options (mapped to slotOverrides internally)
  accessoryCount?: number;
  scarCount?: number;
  tortieCount?: number;
}

export interface SlotSelections {
  accessories: string[];
  scars: string[];
  tortie: (TortieLayer | null)[];
  [traitId: string]: unknown;
}

export interface RandomGenerationResult {
  params: CatParams;
  document?: CatDocument;
  slotSelections: SlotSelections;
  seed?: GachaSeed;
  rngVersion?: "xoshiro128**-v1";
}

export interface CatRenderParams {
  spriteNumber?: number;
  poseName?: string;
  document?: CatDocument;
  params: Partial<Omit<CatParams, "spriteNumber" | "poseName">>;
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
  catalog_hash?: string;
  plan_version?: number;
  manifest_hash?: string;
}

export interface RendererResponse {
  imageDataUrl: string;
  meta: RenderMeta;
  catalogHash?: string;
  planVersion?: number;
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
  catalogHash?: string;
  manifestHash?: string;
  renderPlanVersion?: number;
  frames: SpritesheetFrameMeta[];
  sources?: BatchFrameSource[];
}

export type BatchVariantParams = Omit<Partial<CatParams>, "coatPattern"> & {
  /** Explicit null clears a value inherited from the batch base params. */
  coatPattern?: string | null;
};

export interface BatchVariantPayload {
  id: string;
  label?: string;
  group?: string;
  spriteNumber?: number;
  poseName?: string;
  overrides?: BatchVariantParams;
  params?: BatchVariantParams;
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
