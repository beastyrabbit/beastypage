import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import type {
  AnyCatTraitDefinition,
  CatalogDefinition,
  CatalogElementDefinition,
  CatSystemDefinition,
  RenderBinding,
  RenderOperationBinding,
} from "../lib/cat-system/definition";
import { catSystem } from "../lib/cat-system/registry";
import {
  catDocumentSchema,
  getOrderedRenderOperations,
} from "../lib/cat-system/runtime";
import { COAT_PATTERNS, resolveCoatChoice } from "../lib/cat-v3/coatPatterns";
import { isRandomSelectablePoseName } from "../lib/cat-v3/poseOptions";
import { getAllColorDefs } from "../lib/palettes";
import {
  buildRendererPalettePayloads,
  canonicalizeRendererPalettePayload,
  syncRendererPaletteArtifacts,
} from "./renderer-palette-artifacts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(frontendRoot, "..");
const frontendOnly = process.argv.includes("--frontend-only");
const checkOnly = process.argv.includes("--check");

export interface SpriteIndexEntry {
  spritesheet?: string;
  poseLayout?: string;
  xOffset?: number;
  yOffset?: number;
  paletteSheet?: string;
  [key: string]: unknown;
}

export interface PublicCatalogElement extends CatalogElementDefinition {
  label: string;
}

export interface SpriteAssetInventory {
  spriteIndex: Readonly<Record<string, SpriteIndexEntry>>;
  spriteFileExists: (sheetPath: string) => boolean;
}

export interface TraitHistoryLock {
  formatVersion: 1;
  traitIds: string[];
}

type ResolvedCatalogs = Readonly<
  Record<string, readonly PublicCatalogElement[] | undefined>
>;

interface StrategyManifestEntry {
  key: string;
  version: number;
  configSchema?: unknown;
  configSchemaHash?: string;
}

interface StrategyManifest {
  formatVersion?: number;
  manifestVersion?: number;
  strategies: StrategyManifestEntry[];
  manifestHash?: string;
}

interface BundleIntegrityManifest {
  formatVersion: 1;
  hashAlgorithm: "sha256";
  schemaVersion: number;
  catalogHash: string;
  components: Record<string, string>;
  assetTrees: {
    palettes: Record<string, string>;
    spriteData: Record<string, string>;
    sprites: Record<string, string>;
  };
}

const CATALOG_HASH_PLACEHOLDER = "0".repeat(64);
const BUNDLE_COMPONENT_NAMES = [
  "catDocumentSchema",
  "compatibility",
  "publicCatCatalog",
  "palettes",
  "renderPlan",
  "renderStrategyManifest",
  "spriteData",
  "sprites",
] as const;
type BundleComponentName = (typeof BUNDLE_COMPONENT_NAMES)[number];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function stableStringify(value: unknown, space = 2): string {
  return `${JSON.stringify(stableValue(value), null, space)}\n`;
}

function hashBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function buildBundleCatalogHash(
  schemaVersion: number,
  components: Readonly<Record<BundleComponentName, string>>,
): string {
  // This is the cross-language hash contract. It is an array of integers and
  // sorted ASCII component/digest pairs only. Python can therefore reproduce
  // JSON.stringify byte-for-byte with compact separators, without depending on
  // object key order, locale, Unicode ordering, or float formatting.
  const componentEntries = Object.entries(components).sort(([left], [right]) =>
    compareUtf8(left, right),
  );
  return hashBytes(JSON.stringify([1, schemaVersion, componentEntries]));
}

function hashAssetTreeManifest(
  files: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(files)
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([path, digest]) => [
      Buffer.from(path, "utf8").toString("base64"),
      digest,
    ]);
  return hashBytes(JSON.stringify(entries));
}

interface TraitHistorySystem {
  traits: readonly { id: string }[];
  aliases: Readonly<Record<string, string>>;
  tombstones: Readonly<Record<string, unknown>>;
}

export function buildTraitHistoryLock(
  system: TraitHistorySystem,
  previous: TraitHistoryLock | null,
): TraitHistoryLock {
  if (previous && previous.formatVersion !== 1) {
    throw new Error(
      `Unsupported trait history lock format ${String(previous.formatVersion)}`,
    );
  }
  if (previous && !Array.isArray(previous.traitIds)) {
    throw new Error("Trait history lock has no traitIds array");
  }
  const historicIds = previous?.traitIds ?? [];
  if (
    historicIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(historicIds).size !== historicIds.length
  ) {
    throw new Error("Trait history lock contains invalid or duplicate IDs");
  }

  const activeIds = new Set(system.traits.map((trait) => trait.id));
  for (const historicId of historicIds) {
    if (activeIds.has(historicId)) continue;
    const aliasTarget = system.aliases[historicId];
    if (aliasTarget && activeIds.has(aliasTarget)) continue;
    if (Object.hasOwn(system.tombstones, historicId)) continue;
    throw new Error(
      `Historic trait ${historicId} was removed without an alias or tombstone`,
    );
  }

  const newIds = [...activeIds]
    .filter((id) => !historicIds.includes(id))
    .sort((left, right) => left.localeCompare(right));
  return {
    formatVersion: 1,
    traitIds: [...historicIds, ...newIds],
  };
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function deduplicate(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function getStringList(
  source: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  return deduplicate(
    keys.flatMap((key) => {
      const values = source[key];
      return Array.isArray(values) ? values.map(String) : [];
    }),
  );
}

function resolveAccessorySpriteKey(
  name: string,
  peltInfo: Record<string, unknown>,
  spriteIndex: Record<string, SpriteIndexEntry>,
): string | undefined {
  const spriteKeys = new Set(Object.keys(spriteIndex));
  const trimmed = name.trim();
  const upper = trimmed.toUpperCase();
  const aliases = {
    ...(peltInfo.collar_sprite_aliases as Record<string, string> | undefined),
    ...(peltInfo.accessory_sprite_aliases as
      | Record<string, string>
      | undefined),
  };
  for (const [alias, spriteKey] of Object.entries(aliases)) {
    if (alias.toUpperCase() === upper && spriteKeys.has(spriteKey))
      return spriteKey;
  }

  const categories: Array<[string, readonly string[], readonly string[]]> = [
    [
      "plant_accessories",
      ["acc_plants", "acc_herbs"],
      getStringList(peltInfo, ["plant_accessories"]),
    ],
    [
      "wild_accessories",
      ["acc_wilds", "acc_wild"],
      getStringList(peltInfo, ["wild_accessories"]),
    ],
    [
      "tail_accessories",
      ["tail2_accessories", "acc_tail2"],
      getStringList(peltInfo, ["tail_accessories"]),
    ],
    ["collars", ["collars"], getStringList(peltInfo, ["collars"])],
  ];
  const prefixes = [
    "",
    "acc_herbs",
    "acc_plants",
    "acc_wild",
    "acc_wilds",
    "acc_smallanimal",
    "acc_smallAnimal",
    "acc_tail2",
    "acc_fruit",
    "acc_crafted",
    "acc_aliveinsect",
    "acc_deadinsect",
    "acc_plant2",
    "acc_aliveInsect",
    "acc_deadInsect",
    "tail2_accessories",
  ];
  for (const [, categoryPrefixes, values] of categories) {
    if (values.some((value) => value.toUpperCase() === upper)) {
      prefixes.unshift(...categoryPrefixes);
    }
  }
  for (const prefix of deduplicate(prefixes)) {
    for (const suffix of [
      trimmed,
      upper,
      trimmed.replaceAll(" ", ""),
      upper.replaceAll(" ", ""),
    ]) {
      const candidate = `${prefix}${suffix}`;
      if (spriteKeys.has(candidate)) return candidate;
    }
  }

  const normalized = upper.replaceAll(" ", "");
  return Object.keys(spriteIndex).find((key) => {
    if (!key.startsWith("acc_")) return false;
    return key.toUpperCase().replaceAll(" ", "").endsWith(normalized);
  });
}

function isEmptyRenderableValue(value: string): boolean {
  return ["", "none", "null"].includes(value.trim().toLowerCase());
}

function spriteLayerKey(
  operation: Extract<RenderOperationBinding, { strategy: "spriteLayer" }>,
  value: string,
): string {
  return (
    operation.config.spriteByValue?.[value] ??
    `${operation.config.spriteFamily}${value}`
  );
}

function materializeRenderCatalogAssets(
  catalogs: Record<string, PublicCatalogElement[]>,
  operations: readonly RenderOperationBinding[],
  traits: readonly AnyCatTraitDefinition[],
  peltInfo: Record<string, unknown>,
  spriteIndex: Record<string, SpriteIndexEntry>,
  renderablePoses: readonly string[],
): Record<string, PublicCatalogElement[]> {
  const traitById = new Map(traits.map((trait) => [trait.id, trait] as const));
  const result = Object.fromEntries(
    Object.entries(catalogs).map(([id, elements]) => [
      id,
      elements.map((element) => ({ ...element })),
    ]),
  );

  for (const operation of operations) {
    if (operation.strategy === "spriteLayer") {
      const trait = traitById.get(operation.config.valueTrait);
      const catalogId = trait?.value.catalog;
      if (!catalogId || !result[catalogId]) continue;
      result[catalogId] = result[catalogId].map((element) =>
        isEmptyRenderableValue(element.id)
          ? element
          : {
              ...element,
              spriteKey: spriteLayerKey(operation, element.id),
              poses: element.poses ?? renderablePoses,
            },
      );
      continue;
    }

    if (operation.strategy !== "catalogSpriteList") continue;
    const elements = result[operation.config.catalog];
    if (!elements) continue;
    result[operation.config.catalog] = elements.map((element) => {
      if (isEmptyRenderableValue(element.id)) return element;
      let spriteKey: string | undefined;
      if (operation.config.resolver === "direct") {
        spriteKey = element.id;
      } else if (operation.config.resolver === "mapping") {
        spriteKey = operation.config.sprites?.[element.id] ?? element.spriteKey;
      } else {
        spriteKey =
          element.spriteKey ??
          resolveAccessorySpriteKey(element.id, peltInfo, spriteIndex);
      }
      return {
        ...element,
        ...(spriteKey ? { spriteKey } : {}),
        poses:
          operation.config.availablePoses?.[element.id] ??
          element.poses ??
          renderablePoses,
      };
    });
  }

  return result;
}

function resolveCatalogs(): Record<string, PublicCatalogElement[]> {
  const dataRoot = resolve(frontendRoot, "public/sprite-data");
  const peltInfo = readJson<Record<string, unknown>>(
    resolve(dataRoot, "peltInfo.json"),
  );
  const poseData = readJson<Record<string, unknown>>(
    resolve(dataRoot, "poseData.json"),
  );
  const spriteIndex = readJson<Record<string, SpriteIndexEntry>>(
    resolve(dataRoot, "spritesIndex.json"),
  );
  const renderablePoses = getStringList(poseData, ["renderablePoseNames"]);
  const resolved = new Map<string, PublicCatalogElement[]>();
  const catalogDefinitions: Readonly<Record<string, CatalogDefinition>> =
    catSystem.catalogs;

  const resolveOne = (
    id: string,
    definition: CatalogDefinition,
  ): PublicCatalogElement[] => {
    const cached = resolved.get(id);
    if (cached) return cached;

    let elements: PublicCatalogElement[];
    switch (definition.source) {
      case "peltInfo":
        elements = getStringList(peltInfo, definition.keys).map(
          (elementId) => ({
            id: elementId,
            label: formatLabel(elementId),
          }),
        );
        break;
      case "poseData": {
        const values = getStringList(poseData, [definition.key]).filter(
          (pose) =>
            !definition.randomSelectable || isRandomSelectablePoseName(pose),
        );
        elements = values.map((elementId) => ({
          id: elementId,
          label: formatLabel(elementId),
        }));
        break;
      }
      case "tintData": {
        const tintData = readJson<Record<string, unknown>>(
          resolve(dataRoot, `${definition.file}.json`),
        );
        const colours = tintData.tint_colours;
        const ids =
          colours && typeof colours === "object" ? Object.keys(colours) : [];
        const ordered = ["none", ...ids.filter((entry) => entry !== "none")];
        if (definition.file === "tint") {
          ordered.push("dilute", "warmdilute", "cooldilute");
        }
        elements = deduplicate(ordered).map((elementId) => ({
          id: elementId,
          label: formatLabel(elementId),
        }));
        break;
      }
      case "coatPatterns":
        elements = COAT_PATTERNS.map((pattern) => ({
          id: pattern.id,
          label: pattern.name,
        }));
        break;
      case "paletteColours":
        elements = Object.keys(getAllColorDefs()).map((elementId) => ({
          id: elementId,
          label: formatLabel(elementId),
        }));
        break;
      case "composite": {
        const byElementId = new Map<string, PublicCatalogElement>();
        const selectableCatalogs = definition.selectableCatalogs
          ? new Set(definition.selectableCatalogs)
          : null;
        for (const catalogId of definition.catalogs) {
          const dependency = catalogDefinitions[catalogId];
          if (!dependency)
            throw new Error(`${id} includes unknown catalog ${catalogId}`);
          for (const element of resolveOne(catalogId, dependency)) {
            const candidate =
              selectableCatalogs && !selectableCatalogs.has(catalogId)
                ? { ...element, randomSelectable: false }
                : element;
            const existing = byElementId.get(element.id);
            if (
              !existing ||
              (existing.randomSelectable === false &&
                candidate.randomSelectable !== false)
            ) {
              byElementId.set(element.id, candidate);
            }
          }
        }
        elements = [...byElementId.values()];
        break;
      }
      case "static":
        elements = definition.elements.map((element) => ({
          ...element,
          label: element.label ?? formatLabel(element.id),
        }));
        break;
    }

    resolved.set(id, elements);
    return elements;
  };

  for (const [id, definition] of Object.entries(catalogDefinitions)) {
    resolveOne(id, definition);
  }
  return materializeRenderCatalogAssets(
    Object.fromEntries(resolved),
    getOrderedRenderOperations(),
    catSystem.traits,
    peltInfo,
    spriteIndex,
    renderablePoses,
  );
}

function selectableCatalogElements(
  traitId: string,
  catalogId: string,
  catalogs: ResolvedCatalogs,
): readonly PublicCatalogElement[] {
  const elements = catalogs[catalogId];
  if (!elements) {
    throw new Error(
      `${traitId}.gacha cannot resolve catalog ${catalogId} during generation`,
    );
  }
  const selectable = elements.filter(
    (element) => !element.deprecated && element.randomSelectable !== false,
  );
  if (selectable.length === 0) {
    throw new Error(
      `${traitId}.gacha catalog ${catalogId} has no non-deprecated selectable value`,
    );
  }
  return selectable;
}

/**
 * Proves that every catalog-backed gacha strategy can produce a value accepted
 * by the generated document contract. This runs after source catalogs and
 * pose metadata have been materialized, so failures happen in the generator
 * rather than in a random production roll.
 */
export function validateGachaCatalogContracts(
  system: CatSystemDefinition,
  catalogs: ResolvedCatalogs,
): void {
  const traits = system.traits as readonly AnyCatTraitDefinition[];
  const derivedBySource = new Map<string, AnyCatTraitDefinition[]>();
  for (const trait of traits) {
    if (trait.gacha.strategy !== "derived") continue;
    const targets = derivedBySource.get(trait.gacha.sourceTrait) ?? [];
    targets.push(trait);
    derivedBySource.set(trait.gacha.sourceTrait, targets);
  }

  const poseTrait = traits.find((trait) => trait.id === "pose");
  const selectablePoses =
    poseTrait?.gacha.strategy === "catalogChoice"
      ? selectableCatalogElements(
          poseTrait.id,
          poseTrait.gacha.catalog,
          catalogs,
        ).map((element) => element.id)
      : [];

  const catalogIds = (trait: AnyCatTraitDefinition): readonly string[] => {
    switch (trait.gacha.strategy) {
      case "catalogChoice":
        return [
          trait.gacha.catalog,
          ...(trait.gacha.conditionalCatalogs ?? []).map(
            (conditional) => conditional.catalog,
          ),
        ];
      case "slotList":
        return [trait.gacha.catalog];
      case "tortieList":
        return [
          trait.gacha.maskCatalog,
          trait.gacha.peltCatalog,
          trait.gacha.colourCatalog,
        ];
      default:
        return [];
    }
  };

  for (const trait of traits) {
    const selectableByCatalog = new Map(
      catalogIds(trait).map((catalogId) => [
        catalogId,
        selectableCatalogElements(trait.id, catalogId, catalogs),
      ]),
    );
    if (trait.id !== "pose" && selectablePoses.length > 0) {
      for (const [catalogId, selectable] of selectableByCatalog) {
        const globallyReachable = selectable.some(
          (element) =>
            element.poses === undefined ||
            element.poses.some((pose) => selectablePoses.includes(pose)),
        );
        if (!globallyReachable) {
          throw new Error(
            `${trait.id}.gacha catalog ${catalogId} has no non-deprecated value reachable from an allowed gacha pose`,
          );
        }
      }
    }

    if (trait.gacha.strategy === "catalogChoice" && trait.value.catalog) {
      const valueElements = catalogs[trait.value.catalog];
      if (!valueElements) {
        throw new Error(
          `${trait.id}.value cannot resolve catalog ${trait.value.catalog} during generation`,
        );
      }
      const valueIds = new Set(valueElements.map((element) => element.id));
      const projections = (derivedBySource.get(trait.id) ?? []).filter(
        (target) => target.gacha.strategy === "derived",
      );
      const unproven = catalogIds(trait)
        .flatMap((catalogId) => selectableByCatalog.get(catalogId) ?? [])
        .filter((element) => {
          if (valueIds.has(element.id)) return false;
          return !projections.some((target) => {
            if (
              target.gacha.strategy !== "derived" ||
              target.gacha.resolver !== "coatChoiceProjection"
            ) {
              return false;
            }
            const projected = resolveCoatChoice(element.id);
            if (!valueIds.has(projected.peltName)) return false;
            if (projected.coatPattern === undefined) return true;
            if (!target.value.schema.safeParse(projected.coatPattern).success) {
              return false;
            }
            const targetCatalogId = target.value.catalog;
            if (!targetCatalogId) return true;
            return Boolean(
              catalogs[targetCatalogId]?.some(
                (candidate) => candidate.id === projected.coatPattern,
              ),
            );
          });
        });
      if (unproven.length > 0) {
        throw new Error(
          `${trait.id}.gacha catalog ${trait.gacha.catalog} can emit values outside value catalog ${trait.value.catalog} without a proven projection: ${unproven.map((element) => element.id).join(", ")}`,
        );
      }
    }

    if (trait.gacha.strategy !== "slotList") continue;
    const valueCatalogId = trait.value.catalog;
    if (!valueCatalogId) {
      throw new Error(
        `${trait.id}.gacha slotList requires a value catalog for output validation`,
      );
    }
    const valueElements = catalogs[valueCatalogId];
    if (!valueElements) {
      throw new Error(
        `${trait.id}.value cannot resolve catalog ${valueCatalogId} during generation`,
      );
    }
    const valueIds = new Set(valueElements.map((element) => element.id));
    const selectable = selectableByCatalog.get(trait.gacha.catalog) ?? [];
    const outsideValueCatalog = selectable.filter(
      (element) => !valueIds.has(element.id),
    );
    if (outsideValueCatalog.length > 0) {
      throw new Error(
        `${trait.id}.gacha catalog ${trait.gacha.catalog} is not compatible with value catalog ${valueCatalogId}: ${outsideValueCatalog.map((element) => element.id).join(", ")}`,
      );
    }

    if (!trait.gacha.availableForPose || selectablePoses.length === 0) {
      continue;
    }
    const uncoveredPoses = selectablePoses.filter(
      (pose) =>
        !selectable.some(
          (element) =>
            element.poses === undefined || element.poses.includes(pose),
        ),
    );
    if (uncoveredPoses.length > 0) {
      throw new Error(
        `${trait.id}.gacha catalog ${trait.gacha.catalog} has no selectable value for poses: ${uncoveredPoses.join(", ")}`,
      );
    }
  }
}

function getRenderBindings(
  render: RenderBinding | readonly RenderBinding[],
): readonly RenderBinding[] {
  return "kind" in render ? [render] : render;
}

export function buildPublicCatalog(
  catalogs: Record<string, PublicCatalogElement[]>,
) {
  const traits = catSystem.traits as readonly AnyCatTraitDefinition[];
  return {
    formatVersion: 1,
    schemaVersion: catSystem.schemaVersion,
    traits: traits.map((trait) => ({
      id: trait.id,
      label: trait.label,
      description: trait.description,
      order: trait.order,
      value: {
        kind: trait.value.kind,
        required: trait.value.required,
        default: trait.value.default,
        catalog: trait.value.catalog,
        maxItems: trait.value.maxItems,
        unique: trait.value.unique,
      },
      capabilities: trait.capabilities,
      gacha: trait.gacha,
      renderOperations: getRenderBindings(trait.render)
        .filter((binding) => binding.kind !== "context")
        .map((binding) => binding.operationId),
    })),
    catalogs,
  };
}

function buildCompatibility() {
  return {
    formatVersion: 1,
    schemaVersion: catSystem.schemaVersion,
    aliases: catSystem.aliases,
    tombstones: catSystem.tombstones,
    traits: catSystem.traits.map((trait) => ({
      id: trait.id,
      valueKind: trait.value.kind,
      required: trait.value.required,
      default: trait.value.default,
      legacy: trait.legacy,
    })),
  };
}

function readStrategyManifest(): {
  manifest: StrategyManifest | null;
  hash: string;
} {
  const manifestPath = resolve(
    repositoryRoot,
    "backend/renderer_service/renderer_service/generated/render-strategies.manifest.json",
  );
  if (!existsSync(manifestPath)) {
    const generatedHashPath = resolve(
      frontendRoot,
      "public/cat-system/render-strategy-manifest-hash.txt",
    );
    if (frontendOnly && existsSync(generatedHashPath)) {
      const hash = readFileSync(generatedHashPath, "utf8").trim();
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new Error(`Invalid generated strategy manifest hash: ${hash}`);
      }
      return { manifest: null, hash };
    }
    throw new Error(`Missing Python strategy manifest: ${manifestPath}`);
  }
  const manifest = readJson<StrategyManifest>(manifestPath);
  if (!Array.isArray(manifest.strategies)) {
    throw new Error("Python strategy manifest has no strategies array");
  }
  const hash = createHash("sha256")
    .update(readFileSync(manifestPath))
    .digest("hex");
  return { manifest, hash };
}

function validateStrategies(
  operations: ReturnType<typeof getOrderedRenderOperations>,
  manifest: StrategyManifest | null,
): void {
  if (!manifest) return;
  const supported = new Map(
    manifest.strategies.map((strategy) => [
      `${strategy.key}@${strategy.version}`,
      strategy,
    ]),
  );
  for (const operation of operations) {
    const key = `${operation.strategy}@${operation.version}`;
    const strategy = supported.get(key);
    if (!strategy) {
      throw new Error(
        `Render operation ${operation.operationId} needs unsupported strategy ${key}`,
      );
    }
    if (isRecord(strategy.configSchema)) {
      const errors = validateJsonSchema(
        operation.config,
        strategy.configSchema,
        `${operation.operationId}.config`,
      );
      if (errors.length > 0) {
        throw new Error(
          `Render operation ${operation.operationId} violates Python ${key}: ${errors.join("; ")}`,
        );
      }
    }
  }
}

function validateJsonSchema(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter(isRecord);
    if (
      branches.some(
        (branch) => validateJsonSchema(value, branch, path).length === 0,
      )
    ) {
      return [];
    }
    return [`${path} does not match any allowed shape`];
  }
  if ("const" in schema && value !== schema.const) {
    return [`${path} must equal ${JSON.stringify(schema.const)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${path} must be one of ${schema.enum.map(String).join(", ")}`];
  }

  const type = schema.type;
  if (type === "null") return value === null ? [] : [`${path} must be null`];
  if (type === "string") {
    if (typeof value !== "string") return [`${path} must be a string`];
    if (
      typeof schema.minLength === "number" &&
      value.length < schema.minLength
    ) {
      return [`${path} is shorter than ${schema.minLength}`];
    }
    if (
      typeof schema.maxLength === "number" &&
      value.length > schema.maxLength
    ) {
      return [`${path} is longer than ${schema.maxLength}`];
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    ) {
      return [`${path} does not match ${schema.pattern}`];
    }
    return [];
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? [] : [`${path} must be a boolean`];
  }
  if (type === "integer" || type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [`${path} must be a finite number`];
    }
    if (type === "integer" && !Number.isInteger(value)) {
      return [`${path} must be an integer`];
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return [`${path} must be at least ${schema.minimum}`];
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      return [`${path} must be at most ${schema.maximum}`];
    }
    return [];
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    const errors: string[] = [];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} needs at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path} allows at most ${schema.maxItems} items`);
    }
    if (isRecord(schema.items)) {
      value.forEach((entry, index) => {
        errors.push(
          ...validateJsonSchema(
            entry,
            schema.items as Record<string, unknown>,
            `${path}[${index}]`,
          ),
        );
      });
    }
    return errors;
  }
  if (type === "object" || isRecord(schema.properties)) {
    if (!isRecord(value)) return [`${path} must be an object`];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.map(String)
      : [];
    const errors = required
      .filter((key) => !(key in value))
      .map((key) => `${path}.${key} is required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (isRecord(propertySchema)) {
        errors.push(
          ...validateJsonSchema(entry, propertySchema, `${path}.${key}`),
        );
      } else if (isRecord(schema.additionalProperties)) {
        errors.push(
          ...validateJsonSchema(
            entry,
            schema.additionalProperties,
            `${path}.${key}`,
          ),
        );
      }
    }
    return errors;
  }
  return [];
}

function spriteAssetError(
  spriteKey: string,
  inventory: SpriteAssetInventory,
): string | undefined {
  const indexEntry = inventory.spriteIndex[spriteKey];
  if (!indexEntry) return `references missing sprite ${spriteKey}`;
  if (!indexEntry.spritesheet) return `${spriteKey} has no spritesheet`;
  if (!inventory.spriteFileExists(`${indexEntry.spritesheet}.png`)) {
    return `${spriteKey} references missing ${indexEntry.spritesheet}.png`;
  }
  if (
    indexEntry.paletteSheet &&
    !inventory.spriteFileExists(`${indexEntry.paletteSheet}.png`)
  ) {
    return `${spriteKey} references missing ${indexEntry.paletteSheet}.png`;
  }
  return undefined;
}

function assertSpriteAsset(
  spriteKey: string,
  label: string,
  inventory: SpriteAssetInventory,
): void {
  const error = spriteAssetError(spriteKey, inventory);
  if (error) throw new Error(`${label} ${error}`);
}

export function validateRenderStrategyAssets(
  system: CatSystemDefinition,
  operations: readonly RenderOperationBinding[],
  catalogs: Readonly<Record<string, readonly PublicCatalogElement[]>>,
  inventory: SpriteAssetInventory,
): void {
  const traitById = new Map(
    system.traits.map((trait) => [trait.id, trait] as const),
  );

  for (const operation of operations) {
    if (operation.strategy === "booleanSpriteLayer") {
      if (operation.config.spriteKeys.length === 0) {
        throw new Error(`${operation.operationId}.config.spriteKeys is empty`);
      }
      for (const spriteKey of operation.config.spriteKeys) {
        assertSpriteAsset(
          spriteKey,
          `${operation.operationId}.config.spriteKeys`,
          inventory,
        );
      }
      continue;
    }

    if (operation.strategy === "spriteLayer") {
      for (const [value, spriteKey] of Object.entries(
        operation.config.spriteByValue ?? {},
      )) {
        assertSpriteAsset(
          spriteKey,
          `${operation.operationId}.config.spriteByValue.${value}`,
          inventory,
        );
      }
      const trait = traitById.get(operation.config.valueTrait);
      const catalogId = trait?.value.catalog;
      if (!catalogId) continue;
      const elements = catalogs[catalogId];
      if (!elements) {
        throw new Error(
          `${operation.operationId} cannot resolve value catalog ${catalogId}`,
        );
      }
      const elementIds = new Set(elements.map((element) => element.id));
      for (const value of Object.keys(operation.config.spriteByValue ?? {})) {
        if (!elementIds.has(value)) {
          throw new Error(
            `${operation.operationId}.config.spriteByValue maps unknown catalog value ${value}`,
          );
        }
      }
      for (const element of elements) {
        if (isEmptyRenderableValue(element.id)) continue;
        assertSpriteAsset(
          spriteLayerKey(operation, element.id),
          `${operation.operationId} value ${element.id}`,
          inventory,
        );
      }
      continue;
    }

    if (operation.strategy !== "catalogSpriteList") continue;
    const elements = catalogs[operation.config.catalog];
    if (!elements) {
      throw new Error(
        `${operation.operationId} cannot resolve catalog ${operation.config.catalog}`,
      );
    }
    const elementIds = new Set(elements.map((element) => element.id));
    for (const [value, spriteKey] of Object.entries(
      operation.config.sprites ?? {},
    )) {
      if (!elementIds.has(value)) {
        throw new Error(
          `${operation.operationId}.config.sprites maps unknown catalog value ${value}`,
        );
      }
      assertSpriteAsset(
        spriteKey,
        `${operation.operationId}.config.sprites.${value}`,
        inventory,
      );
    }
    for (const value of Object.keys(operation.config.availablePoses ?? {})) {
      if (!elementIds.has(value)) {
        throw new Error(
          `${operation.operationId}.config.availablePoses maps unknown catalog value ${value}`,
        );
      }
    }
    for (const element of elements) {
      if (isEmptyRenderableValue(element.id)) continue;
      const spriteKey =
        operation.config.resolver === "direct"
          ? element.id
          : operation.config.resolver === "mapping"
            ? (operation.config.sprites?.[element.id] ?? element.spriteKey)
            : element.spriteKey;
      if (!spriteKey) {
        throw new Error(
          `${operation.operationId} has no ${operation.config.resolver} sprite mapping for ${element.id}`,
        );
      }
      assertSpriteAsset(
        spriteKey,
        `${operation.operationId} value ${element.id}`,
        inventory,
      );
    }
  }
}

function pngDimensions(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(0, 24);
  if (
    header.length < 24 ||
    header.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    header.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error(`Invalid PNG spritesheet ${path}`);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function validateCatalogAssets(
  catalogs: Record<string, PublicCatalogElement[]>,
  inventory: SpriteAssetInventory,
): void {
  const spriteIndex = inventory.spriteIndex;
  const poseData = readJson<Record<string, unknown>>(
    resolve(frontendRoot, "public/sprite-data/poseData.json"),
  );
  const knownPoses = new Set((catalogs.poses ?? []).map((entry) => entry.id));
  const namedOffsets = isRecord(poseData.poseNameToOffset)
    ? poseData.poseNameToOffset
    : {};
  const legacyOffsets = isRecord(poseData.legacyPoseNameToOffset)
    ? poseData.legacyPoseNameToOffset
    : {};
  const tileSize = Number(poseData.tileSize);
  if (!Number.isInteger(tileSize) || tileSize <= 0) {
    throw new Error("poseData.tileSize must be a positive integer");
  }
  const dimensions = new Map<string, { width: number; height: number }>();

  for (const [catalogId, elements] of Object.entries(catalogs)) {
    for (const element of elements) {
      const declaredPoses = element.poses ?? [];
      if (new Set(declaredPoses).size !== declaredPoses.length) {
        throw new Error(
          `${catalogId}.${element.id} declares a pose more than once`,
        );
      }
      for (const pose of declaredPoses) {
        if (!knownPoses.has(pose)) {
          throw new Error(
            `${catalogId}.${element.id} uses unknown pose ${pose}`,
          );
        }
      }
      if (!element.spriteKey) continue;
      assertSpriteAsset(
        element.spriteKey,
        `${catalogId}.${element.id}`,
        inventory,
      );
      const indexEntry = spriteIndex[element.spriteKey];
      const frontendSheet = resolve(
        frontendRoot,
        "public/sprites",
        `${indexEntry.spritesheet}.png`,
      );
      if (!existsSync(frontendSheet)) {
        throw new Error(
          `${element.spriteKey} references missing ${frontendSheet}`,
        );
      }
      const sheetSize =
        dimensions.get(frontendSheet) ?? pngDimensions(frontendSheet);
      dimensions.set(frontendSheet, sheetSize);
      const poseOffsets =
        indexEntry.poseLayout === "legacy" ? legacyOffsets : namedOffsets;
      for (const pose of declaredPoses) {
        const rawOffset = poseOffsets[pose];
        if (!isRecord(rawOffset)) {
          throw new Error(
            `${catalogId}.${element.id} declares unsupported ${indexEntry.poseLayout ?? "named"} pose ${pose}`,
          );
        }
        const x =
          Number(indexEntry.xOffset ?? 0) + Number(rawOffset.x) * tileSize;
        const y =
          Number(indexEntry.yOffset ?? 0) + Number(rawOffset.y) * tileSize;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          y < 0 ||
          x + tileSize > sheetSize.width ||
          y + tileSize > sheetSize.height
        ) {
          throw new Error(
            `${catalogId}.${element.id} pose ${pose} is outside ${indexEntry.spritesheet}.png`,
          );
        }
      }
    }
  }
}

function hashAssetTree(root: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        hashes[relative(root, path).replaceAll("\\", "/")] = createHash(
          "sha256",
        )
          .update(readFileSync(path))
          .digest("hex");
      }
    }
  };
  visit(root);
  return hashes;
}

function hashTopLevelAssetFiles(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => compareUtf8(left.name, right.name))
      .map((entry) => [
        entry.name,
        hashBytes(readFileSync(resolve(root, entry.name))),
      ]),
  );
}

function schemaToTypeScript(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf
      .map((entry) => schemaToTypeScript(entry as Record<string, unknown>))
      .join(" | ");
  }
  const type = schema.type;
  if (type === "string") return "string";
  if (type === "boolean") return "boolean";
  if (type === "integer" || type === "number") return "number";
  if (type === "null") return "null";
  if (type === "array") {
    const items = isRecord(schema.items) ? schema.items : {};
    return `Array<${schemaToTypeScript(items)}>`;
  }
  if (type === "object" || schema.properties) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = new Set(
      Array.isArray(schema.required) ? schema.required.map(String) : [],
    );
    const fields = Object.entries(properties).map(
      ([key, value]) =>
        `${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${schemaToTypeScript(value as Record<string, unknown>)};`,
    );
    return `{ ${fields.join(" ")} }`;
  }
  return "JsonValue";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function addCatalogEnumsToDocumentSchema(
  rawSchema: Record<string, unknown>,
  catalogs: Readonly<Record<string, readonly PublicCatalogElement[]>>,
  traits: readonly AnyCatTraitDefinition[],
): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(rawSchema)) as Record<
    string,
    unknown
  >;
  const rootProperties = isRecord(schema.properties) ? schema.properties : {};
  const traitsObject = isRecord(rootProperties.traits)
    ? rootProperties.traits
    : {};
  const traitProperties = isRecord(traitsObject.properties)
    ? traitsObject.properties
    : {};

  const catalogValues = (traitId: string, catalogId: string): string[] => {
    const elements = catalogs[catalogId];
    if (!elements || elements.length === 0) {
      throw new Error(
        `${traitId} has empty or unresolved catalog ${catalogId}`,
      );
    }
    return elements.map((element) => element.id);
  };

  for (const trait of traits) {
    const catalogId = trait.value.catalog;
    const traitSchema = traitProperties[trait.id];
    if (!isRecord(traitSchema)) {
      throw new Error(`${trait.id} is missing from the cat document schema`);
    }

    if (
      trait.value.unique === true &&
      (trait.value.kind === "stringList" || trait.value.kind === "objectList")
    ) {
      traitSchema.uniqueItems = true;
    }

    if (catalogId) {
      const values = catalogValues(trait.id, catalogId);
      if (trait.value.kind === "string") {
        traitSchema.enum = values;
      } else if (trait.value.kind === "stringList") {
        if (!isRecord(traitSchema.items)) {
          throw new Error(
            `${trait.id} has no item schema for catalog ${catalogId}`,
          );
        }
        traitSchema.items.enum = values;
      } else {
        throw new Error(
          `${trait.id} cannot apply catalog ${catalogId} to ${trait.value.kind}`,
        );
      }
    }

    if (trait.gacha.strategy !== "tortieList") continue;
    if (
      !isRecord(traitSchema.items) ||
      !isRecord(traitSchema.items.properties)
    ) {
      throw new Error(`${trait.id} has no compound item schema for tortieList`);
    }
    for (const [property, nestedCatalogId] of [
      ["mask", trait.gacha.maskCatalog],
      ["pattern", trait.gacha.peltCatalog],
      ["colour", trait.gacha.colourCatalog],
    ] as const) {
      const propertySchema = traitSchema.items.properties[property];
      if (!isRecord(propertySchema)) {
        throw new Error(
          `${trait.id} tortieList item schema is missing ${property}`,
        );
      }
      propertySchema.enum = catalogValues(trait.id, nestedCatalogId);
    }
  }
  return schema;
}

function buildGeneratedTypeScript(catalogHash: string): string {
  const traitLines = catSystem.traits.map((trait) => {
    const schema = z.toJSONSchema(trait.value.schema, {
      target: "draft-2020-12",
      unrepresentable: "throw",
    }) as Record<string, unknown>;
    const optional = trait.value.required ? "" : "?";
    return `  ${JSON.stringify(trait.id)}${optional}: ${schemaToTypeScript(schema)};`;
  });
  return [
    "// Generated by scripts/generate-cat-system.ts. Do not edit.",
    'import type { JsonValue } from "../definition";',
    "",
    `export const GENERATED_CAT_SCHEMA_VERSION = ${catSystem.schemaVersion} as const;`,
    `export const CAT_CATALOG_HASH = ${JSON.stringify(catalogHash)} as const;`,
    `export const GENERATED_CAT_TRAIT_IDS = ${JSON.stringify(catSystem.traits.map((trait) => trait.id))} as const;`,
    "export type GeneratedCatTraitId = (typeof GENERATED_CAT_TRAIT_IDS)[number];",
    "",
    "export interface GeneratedCatTraits {",
    ...traitLines,
    "}",
    "",
    "export interface GeneratedCatDocument {",
    `  schemaVersion: ${catSystem.schemaVersion};`,
    "  traits: GeneratedCatTraits;",
    "  unknownTraits?: Record<string, JsonValue>;",
    "}",
    "",
  ].join("\n");
}

function buildGeneratedCatalogValues(
  catalogs: Readonly<Record<string, readonly PublicCatalogElement[]>>,
  traits: readonly AnyCatTraitDefinition[],
): Record<string, string[]> {
  const referencedCatalogs = new Set<string>();
  for (const trait of traits) {
    if (trait.value.catalog) referencedCatalogs.add(trait.value.catalog);
    if (trait.gacha.strategy === "tortieList") {
      referencedCatalogs.add(trait.gacha.maskCatalog);
      referencedCatalogs.add(trait.gacha.peltCatalog);
      referencedCatalogs.add(trait.gacha.colourCatalog);
    }
  }
  return Object.fromEntries(
    [...referencedCatalogs]
      .sort((left, right) => left.localeCompare(right))
      .map((catalogId) => {
        const elements = catalogs[catalogId];
        if (!elements || elements.length === 0) {
          throw new Error(`Cannot emit unresolved value catalog ${catalogId}`);
        }
        return [catalogId, elements.map((element) => element.id)];
      }),
  );
}

function writeOrCheck(path: string, content: string): void {
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`Generated cat-system artifact is stale: ${path}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function emitArtifacts(): void {
  if (!frontendOnly) {
    const paletteSync = syncRendererPaletteArtifacts({ checkOnly });
    if (paletteSync.extra.length > 0) {
      throw new Error(
        `Unexpected renderer palette files must be removed explicitly: ${paletteSync.extra.join(", ")}`,
      );
    }
    if (checkOnly && paletteSync.drifted.length > 0) {
      throw new Error(
        `Generated renderer palette artifacts are stale: ${paletteSync.drifted.join(", ")}`,
      );
    }
  }

  const catalogs = resolveCatalogs();
  const spriteIndex = readJson<Record<string, SpriteIndexEntry>>(
    resolve(frontendRoot, "public/sprite-data/spritesIndex.json"),
  );
  const inventory: SpriteAssetInventory = {
    spriteIndex,
    spriteFileExists: (sheetPath) =>
      existsSync(resolve(frontendRoot, "public/sprites", sheetPath)),
  };
  validateCatalogAssets(catalogs, inventory);
  validateGachaCatalogContracts(catSystem, catalogs);
  const publicCatalogBase = buildPublicCatalog(catalogs);
  const compatibility = buildCompatibility();
  const operations = getOrderedRenderOperations();
  validateRenderStrategyAssets(catSystem, operations, catalogs, inventory);
  const strategyManifest = readStrategyManifest();
  validateStrategies(operations, strategyManifest?.manifest ?? null);
  const documentSchema = addCatalogEnumsToDocumentSchema(
    z.toJSONSchema(catDocumentSchema, {
      target: "draft-2020-12",
      unrepresentable: "throw",
    }) as Record<string, unknown>,
    catalogs,
    catSystem.traits,
  );
  const traitHistoryPath = resolve(
    frontendRoot,
    "lib/cat-system/trait-history.lock.json",
  );
  const previousTraitHistory = existsSync(traitHistoryPath)
    ? readJson<TraitHistoryLock>(traitHistoryPath)
    : null;
  // Validate removals against the checked-in history before computing/writing
  // an updated lock. A generate run must never erase evidence of an old ID.
  const traitHistory = buildTraitHistoryLock(catSystem, previousTraitHistory);

  const assetTrees = {
    // Palette JSON is generated deterministically from frontend/lib/palettes.
    // Frontend-only Docker builds can reproduce this tree without reaching
    // outside their build context; the full check also verifies the backend
    // runtime copy semantically above.
    palettes: Object.fromEntries(
      [...buildRendererPalettePayloads()].map(([path, payload]) => [
        path,
        hashBytes(canonicalizeRendererPalettePayload(payload)),
      ]),
    ),
    // Only the seven root JSON files form the renderer's runtime metadata
    // contract. The nested source dictionaries are not copied into the image.
    spriteData: hashTopLevelAssetFiles(
      resolve(frontendRoot, "public/sprite-data"),
    ),
    // Every canonical sprite is shipped, so this inventory is recursive.
    sprites: hashAssetTree(resolve(frontendRoot, "public/sprites")),
  };
  const strategyManifestHash = strategyManifest.hash;
  const rendererCatalogs = Object.fromEntries(
    Object.entries(catalogs).map(([catalogId, elements]) => [
      catalogId,
      elements.map((element) => {
        const copy = { ...element };
        delete copy.randomSelectable;
        return copy;
      }),
    ]),
  );
  const buildRenderPlan = (catalogHash: string) => ({
    formatVersion: 1,
    schemaVersion: catSystem.schemaVersion,
    catalogHash,
    manifestHash: strategyManifestHash,
    operations: operations.map((operation, index) => ({
      id: operation.operationId,
      layerId: operation.layerId,
      strategy: operation.strategy,
      strategyVersion: operation.version,
      dependsOn: operation.after ?? [],
      order: index,
      reads: operation.reads ?? [],
      config: operation.config,
    })),
    catalogs: rendererCatalogs,
  });
  const placeholderPublicCatalog = {
    ...publicCatalogBase,
    catalogHash: CATALOG_HASH_PLACEHOLDER,
  };
  const placeholderRenderPlan = buildRenderPlan(CATALOG_HASH_PLACEHOLDER);
  const components: Record<BundleComponentName, string> = {
    catDocumentSchema: hashBytes(stableStringify(documentSchema)),
    compatibility: hashBytes(stableStringify(compatibility)),
    // These two artifacts contain the resulting catalogHash. Replacing that
    // one fixed-width root field with 64 zeroes makes their digest acyclic;
    // the Python verifier applies the same byte normalization before hashing.
    publicCatCatalog: hashBytes(stableStringify(placeholderPublicCatalog)),
    palettes: hashAssetTreeManifest(assetTrees.palettes),
    renderPlan: hashBytes(stableStringify(placeholderRenderPlan)),
    renderStrategyManifest: strategyManifestHash,
    spriteData: hashAssetTreeManifest(assetTrees.spriteData),
    sprites: hashAssetTreeManifest(assetTrees.sprites),
  };
  if (
    BUNDLE_COMPONENT_NAMES.some(
      (name) => !/^[a-f0-9]{64}$/.test(components[name]),
    )
  ) {
    throw new Error(
      "Cannot generate bundle integrity without cryptographic component hashes",
    );
  }
  const catalogHash = buildBundleCatalogHash(
    catSystem.schemaVersion,
    components,
  );
  const publicCatalog = { ...publicCatalogBase, catalogHash };
  const renderPlan = buildRenderPlan(catalogHash);
  const integrityManifest: BundleIntegrityManifest = {
    formatVersion: 1,
    hashAlgorithm: "sha256",
    schemaVersion: catSystem.schemaVersion,
    catalogHash,
    components,
    assetTrees,
  };

  const frontendArtifacts = new Map<string, string>([
    [traitHistoryPath, stableStringify(traitHistory)],
    [
      resolve(frontendRoot, "lib/cat-system/generated/cat-schema.generated.ts"),
      buildGeneratedTypeScript(catalogHash),
    ],
    [
      resolve(
        frontendRoot,
        "lib/cat-system/generated/catalog-values.generated.json",
      ),
      stableStringify(buildGeneratedCatalogValues(catalogs, catSystem.traits)),
    ],
    [
      resolve(frontendRoot, "public/cat-system/public-cat-catalog.json"),
      stableStringify(publicCatalog),
    ],
    [
      resolve(frontendRoot, "public/cat-system/cat-document.schema.json"),
      stableStringify(documentSchema),
    ],
    [
      resolve(frontendRoot, "public/cat-system/catalog-hash.txt"),
      `${catalogHash}\n`,
    ],
    [
      resolve(
        frontendRoot,
        "public/cat-system/render-strategy-manifest-hash.txt",
      ),
      `${strategyManifestHash}\n`,
    ],
  ]);
  for (const [path, content] of frontendArtifacts) writeOrCheck(path, content);

  if (!frontendOnly) {
    const rendererGenerated = resolve(
      repositoryRoot,
      "backend/renderer_service/renderer_service/generated",
    );
    const backendArtifacts = new Map<string, string>([
      [
        resolve(rendererGenerated, "render-plan.json"),
        stableStringify(renderPlan),
      ],
      [
        resolve(rendererGenerated, "cat-document.schema.json"),
        stableStringify(documentSchema),
      ],
      [
        resolve(rendererGenerated, "compatibility.json"),
        stableStringify(compatibility),
      ],
      [
        resolve(rendererGenerated, "public-cat-catalog.json"),
        stableStringify(publicCatalog),
      ],
      [resolve(rendererGenerated, "catalog-hash.txt"), `${catalogHash}\n`],
      [
        resolve(rendererGenerated, "bundle-integrity.json"),
        stableStringify(integrityManifest),
      ],
      [
        resolve(
          repositoryRoot,
          "backend/discord-bot/src/generated/public-cat-catalog.json",
        ),
        stableStringify(publicCatalog),
      ],
      [
        resolve(
          repositoryRoot,
          "backend/discord-bot/src/generated/catalog-hash.txt",
        ),
        `${catalogHash}\n`,
      ],
    ]);
    for (const [path, content] of backendArtifacts) writeOrCheck(path, content);
  }

  console.log(
    `${checkOnly ? "Checked" : "Generated"} ${catSystem.traits.length} traits, ${Object.keys(catalogs).length} catalogs, catalog ${catalogHash.slice(0, 12)}`,
  );
}

const executedScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (executedScript === import.meta.url) emitArtifacts();
