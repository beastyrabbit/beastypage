import type { CatSystem, CatTraitId } from "../registry";
import type { CatDocument } from "../runtime";

/**
 * Registry-derived rather than a hand-maintained CountCategory union. Runtime
 * validation still accepts count controls only for slot strategy traits.
 */
type SlotTraitId<TTrait> = TTrait extends {
  id: infer TId extends string;
  gacha: { strategy: "slotList" | "tortieList" };
}
  ? TId
  : never;

export type GachaSlotTraitId = SlotTraitId<CatSystem["traits"][number]>;
export type GachaCountMode = "weighted" | "uniform";
export type GachaSeed = string | number;

export type GachaSlotOverrides = Partial<Record<GachaSlotTraitId, number>>;

export type GachaCountsMode =
  | GachaCountMode
  | Partial<Record<GachaSlotTraitId, GachaCountMode>>;

export type GachaSlotRanges = Partial<
  Record<GachaSlotTraitId, { min: number; max: number }>
>;

export interface RandomSource {
  nextUint32(): number;
  nextFloat(): number;
}

export interface GachaCatalog {
  /**
   * A catalog may contain several pools. The engine first chooses a pool and
   * then a value. This preserves the existing equal-per-palette behaviour.
   */
  pools: readonly (readonly string[])[];
  byPose?: Readonly<Record<string, readonly string[]>>;
  /** Relative weights inside a selected pool; omitted values default to 1. */
  weights?: Readonly<Record<string, number>>;
  /**
   * Values compiled from the system catalog. Runtime pools may narrow random
   * selection, but explicit fixed traits are validated against this set.
   */
  canonicalValues?: readonly string[];
  /** Pose-specific canonical values for pose-restricted catalogs. */
  canonicalByPose?: Readonly<Record<string, readonly string[]>>;
}

export type GachaCatalogs = Readonly<Record<string, GachaCatalog>>;

export type GachaCatalogOverride =
  | GachaCatalog
  | readonly string[]
  | readonly (readonly string[])[];

/**
 * Open by catalog ID on purpose: adding a registry catalog must not require a
 * second TypeScript union or interface change in the gacha adapter.
 */
export type GachaCatalogOverrides = Readonly<
  Record<string, GachaCatalogOverride | undefined>
>;

export interface GachaGenerationOptions {
  seed?: GachaSeed;
  exactLayerCounts?: boolean;
  countsMode?: GachaCountsMode;
  slotOverrides?: GachaSlotOverrides;
  /** Legacy profile defaults used only when no explicit count control exists. */
  defaultSlotCounts?: GachaSlotOverrides;
  /** Legacy range settings, notably the Discord per-user configuration. */
  slotRanges?: GachaSlotRanges;
  fixedTraits?: Partial<Record<CatTraitId, unknown>> & Record<string, unknown>;
  /**
   * Compatibility hook for traits that predate a registry gacha binding.
   * The roll still happens inside the shared deterministic engine.
   */
  traitProbabilities?: Partial<Record<CatTraitId, number>>;
}

export type GachaSlotSelections = Partial<Record<GachaSlotTraitId, unknown[]>>;

export interface GachaRollResult {
  document: CatDocument;
  slotSelections: GachaSlotSelections;
  seed: GachaSeed;
  rngVersion: "xoshiro128**-v1";
}

export interface SystemGachaRollResult {
  document: {
    schemaVersion: number;
    traits: Record<string, unknown>;
    unknownTraits?: Record<string, unknown>;
  };
  slotSelections: Partial<Record<string, unknown[]>>;
  seed: GachaSeed;
  rngVersion: "xoshiro128**-v1";
}
