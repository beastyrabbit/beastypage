import { type PublicCatCatalogElement, publicCatCatalog } from "../catalog";
import type {
  GachaCatalog,
  GachaCatalogOverride,
  GachaCatalogOverrides,
  GachaCatalogs,
} from "./types";

export interface GachaPublicCatalogSource {
  catalogs: Readonly<
    Record<string, readonly GachaPublicCatalogElement[] | undefined>
  >;
}

export type GachaPublicCatalogElement = Pick<PublicCatCatalogElement, "id"> &
  Partial<
    Pick<
      PublicCatCatalogElement,
      "deprecated" | "poses" | "randomSelectable" | "weight"
    >
  >;

function canonicalValues(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, "en"));
}

function catalog(values: readonly string[]): GachaCatalog {
  const normalized = canonicalValues(values);
  return { pools: [normalized], canonicalValues: normalized };
}

function pooledCatalog(pools: readonly (readonly string[])[]): GachaCatalog {
  const normalized = pools
    .map(canonicalValues)
    .filter((values) => values.length > 0);
  return {
    pools: normalized,
    canonicalValues: canonicalValues(normalized.flat()),
  };
}

function catalogFromPublicElements(
  elements: readonly GachaPublicCatalogElement[],
  knownPoses: readonly string[],
): GachaCatalog {
  const selectable = elements.filter(
    (element) => !element.deprecated && element.randomSelectable !== false,
  );
  const unrestricted = selectable
    .filter((element) => element.poses === undefined)
    .map((element) => element.id);
  const poseRestricted = selectable.filter(
    (element) => element.poses !== undefined,
  );
  const poseRestrictedCanonical = elements.filter(
    (element) => element.poses !== undefined,
  );
  const unrestrictedCanonical = elements
    .filter((element) => element.poses === undefined)
    .map((element) => element.id);
  const result = {
    ...catalog(selectable.map((element) => element.id)),
    // Deprecated values remain part of the document contract so existing
    // cats and explicit fixed traits keep validating. They are excluded only
    // from the random-selection pools above.
    canonicalValues: canonicalValues(elements.map((element) => element.id)),
  };
  const weights = Object.fromEntries(
    selectable.flatMap((element) =>
      element.weight === undefined ? [] : [[element.id, element.weight]],
    ),
  );
  const weightedResult =
    Object.keys(weights).length === 0 ? result : { ...result, weights };
  if (poseRestricted.length === 0 && poseRestrictedCanonical.length === 0) {
    return weightedResult;
  }
  const poses = canonicalValues([
    ...knownPoses,
    ...poseRestrictedCanonical.flatMap((element) => element.poses ?? []),
  ]);
  const byPose = Object.fromEntries(
    poses.map((pose) => [
      pose,
      canonicalValues([
        ...unrestricted,
        ...poseRestricted
          .filter((element) => element.poses?.includes(pose))
          .map((element) => element.id),
      ]),
    ]),
  );
  const canonicalByPose = Object.fromEntries(
    poses.map((pose) => [
      pose,
      canonicalValues([
        ...unrestrictedCanonical,
        ...poseRestrictedCanonical
          .filter((element) => element.poses?.includes(pose))
          .map((element) => element.id),
      ]),
    ]),
  );
  return { ...weightedResult, byPose, canonicalByPose };
}

function normalizeOverride(override: GachaCatalogOverride): GachaCatalog {
  if (!Array.isArray(override)) return override as GachaCatalog;
  if (override.length > 0 && Array.isArray(override[0])) {
    return pooledCatalog(override as readonly (readonly string[])[]);
  }
  return catalog(override as readonly string[]);
}

function runtimeCatalogValues(catalog: GachaCatalog): string[] {
  return canonicalValues([
    ...catalog.pools.flat(),
    ...Object.values(catalog.byPose ?? {}).flat(),
    ...Object.keys(catalog.weights ?? {}),
  ]);
}

function assertRuntimeCatalogSubset(
  catalogId: string,
  runtimeCatalog: GachaCatalog,
  canonicalCatalog: GachaCatalog,
): void {
  const canonical = new Set(canonicalCatalog.canonicalValues);
  const unsupported = runtimeCatalogValues(runtimeCatalog).filter(
    (value) => !canonical.has(value),
  );
  if (unsupported.length === 0) return;
  throw new Error(
    `Gacha catalog override ${catalogId} contains values outside the compiled catalog: ${unsupported.join(", ")}`,
  );
}

/**
 * Converts every catalog in the generated public artifact. There is no trait
 * or catalog switch here, so a newly compiled catalog is immediately visible
 * to the common gacha engine.
 */
export function createGachaCatalogsFromPublicCatalog(
  source: GachaPublicCatalogSource,
  overrides: GachaCatalogOverrides = {},
): GachaCatalogs {
  const knownPoses = (source.catalogs.poses ?? []).map((element) => element.id);
  const catalogs: Record<string, GachaCatalog> = {};
  for (const [catalogId, elements] of Object.entries(source.catalogs)) {
    if (!elements) continue;
    catalogs[catalogId] = catalogFromPublicElements(elements, knownPoses);
  }
  for (const [catalogId, override] of Object.entries(overrides)) {
    if (override === undefined) continue;
    const canonicalCatalog = catalogs[catalogId];
    const runtimeCatalog = normalizeOverride(override);
    if (canonicalCatalog) {
      assertRuntimeCatalogSubset(catalogId, runtimeCatalog, canonicalCatalog);
    }
    catalogs[catalogId] = {
      ...runtimeCatalog,
      canonicalValues:
        canonicalCatalog?.canonicalValues ?? runtimeCatalog.canonicalValues,
      canonicalByPose:
        canonicalCatalog?.canonicalByPose ?? runtimeCatalog.canonicalByPose,
    };
  }
  return catalogs;
}

/** Uses the compiler output as the default and accepts only runtime deltas. */
export function createGachaCatalogs(
  overrides: GachaCatalogOverrides = {},
): GachaCatalogs {
  return createGachaCatalogsFromPublicCatalog(publicCatCatalog, overrides);
}
