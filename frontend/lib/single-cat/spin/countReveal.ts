import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { cloneParams } from "@/components/stream-control/obs/spinSupport";
import { syncChangedRegistryTraitsFromLegacy } from "@/lib/cat-system";
import type { CatParams } from "@/lib/cat-v3/types";
import type { LayerRange } from "@/utils/singleCatVariants";
import type { SpinFrameLoader, VariantDescriptor } from "./types";

export type CountRevealKey = "accessory" | "scar" | "tortieMask";

const COUNT_GROUP_TRAIT_IDS = {
  accessory: "accessories",
  scar: "scars",
  tortieMask: "tortie",
} as const;

export interface CountRevealInput {
  label: string;
  key: CountRevealKey;
  range: LayerRange;
  /** The count the reveal lands on. */
  count: number;
}

/** One group of the "exact rolled count" reveal, ready to preload. */
export interface CountRevealGroup {
  label: string;
  key: CountRevealKey;
  minCount: number;
  maxCount: number;
  count: number;
  /** Batch base: the fewest-layers frame, so no max-count layer leaks in. */
  baseParams: Partial<CatParams>;
  /** One frame per possible count, from `minCount` to `maxCount`. */
  descriptors: VariantDescriptor[];
}

export interface CountRevealOptions {
  experimentalColourMode: string | string[];
  includeBaseColours: boolean;
  includeNewSprites: boolean;
}

function withLayerCount(
  baseParams: Partial<CatParams>,
  key: CountRevealKey,
  slots: Awaited<
    ReturnType<NonNullable<CatGeneratorApi["generateRandomCat"]>>
  >["slotSelections"],
  n: number,
): Partial<CatParams> {
  const previewParams = cloneParams(baseParams);
  if (key === "accessory") {
    const accSlice = (slots?.accessories ?? []).slice(0, n);
    previewParams.accessories = accSlice;
    previewParams.accessory = accSlice[0];
  } else if (key === "scar") {
    const scarSlice = (slots?.scars ?? []).slice(0, n);
    previewParams.scars = scarSlice;
    previewParams.scar = scarSlice[0];
  } else {
    const tortieSlice = (slots?.tortie ?? []).slice(0, n);
    previewParams.isTortie = n > 0;
    previewParams.tortie = tortieSlice;
    if (tortieSlice[0]) {
      previewParams.tortieMask = tortieSlice[0].mask;
      previewParams.tortiePattern = tortieSlice[0].pattern;
      previewParams.tortieColour = tortieSlice[0].colour;
    } else {
      previewParams.isTortie = false;
      previewParams.tortie = [];
    }
  }
  syncChangedRegistryTraitsFromLegacy(previewParams, [
    "pose",
    COUNT_GROUP_TRAIT_IDS[key],
  ]);
  return previewParams;
}

/**
 * Rolls a max-count cat for every group whose range allows more than one
 * count (in parallel, keeping the given order) and builds its per-count
 * frames, so the whole count reveal can be preloaded before it plays.
 */
export async function prepareCountReveal(
  generator: CatGeneratorApi,
  inputs: CountRevealInput[],
  options: CountRevealOptions,
): Promise<CountRevealGroup[]> {
  if (!generator.generateRandomCat) return [];
  const generateRandomCat = generator.generateRandomCat.bind(generator);

  const groups = inputs
    .map((input) => ({
      ...input,
      minCount: Math.min(input.range.min, input.range.max),
      maxCount: Math.max(input.range.min, input.range.max),
    }))
    .filter((group) => group.minCount !== group.maxCount);

  return Promise.all(
    groups.map(async (group): Promise<CountRevealGroup> => {
      // A fresh random cat with the MAX count for this layer type
      const catResult = await generateRandomCat({
        accessoryCount: group.key === "accessory" ? group.maxCount : 0,
        scarCount: group.key === "scar" ? group.maxCount : 0,
        tortieCount: group.key === "tortieMask" ? group.maxCount : 0,
        exactLayerCounts: true,
        experimentalColourMode: options.experimentalColourMode,
        includeBaseColours: options.includeBaseColours,
        includeNewSprites: options.includeNewSprites,
      });

      const maxCat = catResult.params;
      maxCat.spriteNumber = 9; // legacy fallback for old render paths
      maxCat.poseName = "adult_long0";

      const descriptors: VariantDescriptor[] = [];
      for (let n = group.minCount; n <= group.maxCount; n++) {
        descriptors.push({
          id: `count-${group.key}-${n}`,
          option: { raw: n, display: String(n) },
          params: withLayerCount(maxCat, group.key, catResult.slotSelections, n),
          label: String(n),
          group: `count-${group.key}`,
        });
      }

      return {
        label: group.label,
        key: group.key,
        minCount: group.minCount,
        maxCount: group.maxCount,
        count: group.count,
        baseParams: descriptors[0].params,
        descriptors,
      };
    }),
  );
}

/** Queue every count-reveal frame, in reveal order. */
export function prefetchCountReveal(
  loader: SpinFrameLoader,
  groups: CountRevealGroup[],
): void {
  for (const group of groups) {
    loader.prefetch(group.baseParams, group.descriptors);
  }
}
