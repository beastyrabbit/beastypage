import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export type TraitValueKind =
  | "string"
  | "boolean"
  | "integer"
  | "stringList"
  | "objectList";

interface TraitValueDefinitionBase<TSchema extends z.ZodType = z.ZodType> {
  kind: TraitValueKind;
  schema: TSchema;
  catalog?: string;
  maxItems?: number;
  unique?: boolean;
}

export type TraitValueDefinition<
  TSchema extends z.ZodType = z.ZodType,
  TRequired extends boolean = boolean,
> = TraitValueDefinitionBase<TSchema> &
  (TRequired extends true
    ? { required: true; default: z.infer<TSchema> }
    : { required: false; default?: z.infer<TSchema> });

export type LegacyBinding =
  | { strategy: "direct"; key: string }
  | { strategy: "list"; key: string; singleKey?: string }
  | { strategy: "pose"; key: "poseName"; spriteKey: "spriteNumber" }
  | { strategy: "tortie" }
  | { strategy: "booleanAlias"; key: string; aliases: readonly string[] };

interface RenderOperationBase<TStrategy extends string, TConfig> {
  kind: "operation";
  operationId: string;
  layerId: string;
  strategy: TStrategy;
  version: number;
  after?: readonly string[];
  reads?: readonly string[];
  config: TConfig;
}

export type RenderOperationBinding =
  | RenderOperationBase<"basePelt", Record<string, never>>
  | RenderOperationBase<"coatPattern", Record<string, never>>
  | RenderOperationBase<"tintMultiply", Record<string, never>>
  | RenderOperationBase<
      "spriteLayer",
      {
        valueTrait: string;
        spriteFamily: string;
        tintTrait?: string;
        tintResolver?: "whitePatch";
        diagnosticPrefix: string;
        spriteByValue?: Readonly<Record<string, string>>;
      }
    >
  | RenderOperationBase<"eyes", Record<string, never>>
  | RenderOperationBase<"scarPrimary", Record<string, never>>
  | RenderOperationBase<
      "booleanSpriteLayer",
      {
        valueTrait: string;
        spriteKeys: readonly string[];
        blend: "alpha" | "multiply" | "screen" | "add" | "replace";
        diagnostic: string;
      }
    >
  | RenderOperationBase<
      "solidMultiply",
      {
        valueTrait: string;
        colour: readonly [number, number, number, number];
        diagnostic: string;
      }
    >
  | RenderOperationBase<"lineart", Record<string, never>>
  | RenderOperationBase<"scarSecondary", Record<string, never>>
  | RenderOperationBase<
      "catalogSpriteList",
      {
        valueTrait: string;
        catalog: string;
        resolver: "accessory" | "direct" | "mapping";
        sprites?: Readonly<Record<string, string>>;
        availablePoses?: Readonly<Record<string, readonly string[]>>;
        blend?: "alpha" | "multiply" | "screen" | "add" | "replace";
      }
    >
  | RenderOperationBase<
      "globalMirror",
      { valueTrait: string; affectsPreviousLayers: true }
    >;

export interface RenderInputBinding {
  kind: "input";
  operationId: string;
}

export interface RenderContextBinding {
  kind: "context";
}

export type RenderBinding =
  | RenderOperationBinding
  | RenderInputBinding
  | RenderContextBinding;

export interface WeightedCount {
  strategy: "weightedDiscrete";
  weights: Readonly<Record<string, number>>;
  min: number;
  max: number;
}

export interface UniformCount {
  strategy: "uniformCount";
  min: number;
  max: number;
}

export type CountDistribution = WeightedCount | UniformCount;

export interface GachaGate {
  /** Traits sharing a group consume one deterministic activation roll. */
  group: string;
  probability: number;
}

/** Closed registry of deterministic projections supported by the gacha core. */
export type GachaDerivedResolver = "coatChoiceProjection";

interface OrderedGachaBinding {
  dependsOn?: readonly string[];
  gate?: GachaGate;
}

export interface ConditionalGachaCatalog {
  catalog: string;
  whenTrait: string;
  condition: "nonEmptyList";
}

export type GachaBinding =
  | { strategy: "none" }
  | (OrderedGachaBinding & {
      strategy: "catalogChoice";
      catalog: string;
      optionalProbability?: number;
      /** Adds one virtual unset entry to the catalog selection itself. */
      includeUnsetChoice?: boolean;
      /** Selects uniformly from the deduplicated value union with one draw. */
      flattenSelection?: boolean;
      /** Replaces the default runtime pool when its trait condition holds. */
      conditionalCatalogs?: readonly ConditionalGachaCatalog[];
    })
  | (OrderedGachaBinding & {
      strategy: "boolean";
      probability: number;
    })
  | (OrderedGachaBinding & {
      strategy: "slotList";
      catalog: string;
      count: CountDistribution;
      fillProbability?: number;
      unique: boolean;
      availableForPose?: boolean;
    })
  | (OrderedGachaBinding & {
      strategy: "tortieList";
      maskCatalog: string;
      peltCatalog: string;
      colourCatalog: string;
      count: CountDistribution;
      activationProbability: number;
      fillProbability: number;
      uniqueMasks: boolean;
    })
  | {
      strategy: "derived";
      resolver: GachaDerivedResolver;
      sourceTrait: string;
      dependsOn: readonly string[];
    };

export interface TraitConsumerCapabilities {
  display: boolean;
  edit: false | "select" | "toggle" | "list" | "compoundList";
  reveal:
    | false
    | {
        strategy: "single" | "slots" | "compoundSlots";
        timingKey?: string;
        defaultSteps?: number;
        /** Existing Gacha presentation stays stable; future traits default in. */
        spin?: false | { order?: number; label?: string };
      };
  evolution: "replace" | "accumulate" | "preserve" | "none";
  inherit: "copy" | "mutate" | "none";
  settings: boolean;
}

export interface CatTraitDefinition<
  TId extends string = string,
  TSchema extends z.ZodType = z.ZodType,
  TRequired extends boolean = boolean,
> {
  id: TId;
  label: string;
  description?: string;
  order: number;
  value: TraitValueDefinition<TSchema, TRequired>;
  legacy: LegacyBinding;
  render: RenderBinding | readonly RenderBinding[];
  gacha: GachaBinding;
  capabilities: TraitConsumerCapabilities;
}

export type AnyCatTraitDefinition = CatTraitDefinition<
  string,
  z.ZodType,
  boolean
>;

const CAPABILITY_VALIDATORS = {
  display: (value: unknown) => typeof value === "boolean",
  edit: (value: unknown) =>
    value === false ||
    ["select", "toggle", "list", "compoundList"].includes(String(value)),
  reveal: (value: unknown) => {
    if (value === false) return true;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const reveal = value as Record<string, unknown>;
    if (
      !["single", "slots", "compoundSlots"].includes(String(reveal.strategy))
    ) {
      return false;
    }
    if (
      reveal.timingKey !== undefined &&
      (typeof reveal.timingKey !== "string" || reveal.timingKey.length === 0)
    ) {
      return false;
    }
    return (
      reveal.defaultSteps === undefined ||
      (Number.isInteger(reveal.defaultSteps) && Number(reveal.defaultSteps) > 0)
    );
  },
  evolution: (value: unknown) =>
    ["replace", "accumulate", "preserve", "none"].includes(String(value)),
  inherit: (value: unknown) =>
    ["copy", "mutate", "none"].includes(String(value)),
  settings: (value: unknown) => typeof value === "boolean",
} as const;

function isSchemaForValueKind(
  schema: z.ZodType,
  kind: Exclude<TraitValueKind, "integer">,
): boolean {
  if (kind === "string") return schema instanceof z.ZodString;
  if (kind === "boolean") return schema instanceof z.ZodBoolean;
  if (!(schema instanceof z.ZodArray)) return false;
  if (kind === "stringList") return schema.element instanceof z.ZodString;
  if (kind === "objectList") return schema.element instanceof z.ZodObject;
  return false;
}

function isTortieValueSchema(schema: z.ZodType): boolean {
  if (!(schema instanceof z.ZodArray)) return false;
  const element = schema.element;
  if (!(element instanceof z.ZodObject)) return false;
  const shape = element.shape as Record<string, z.ZodType>;
  return ["mask", "pattern", "colour"].every(
    (key) => shape[key] instanceof z.ZodString,
  );
}

function hasCatalogBackedValue(
  definition: CatTraitDefinition,
  catalogIds: ReadonlySet<string>,
  kind: "string" | "stringList",
): boolean {
  return (
    definition.value.kind === kind &&
    typeof definition.value.catalog === "string" &&
    catalogIds.has(definition.value.catalog)
  );
}

function hasTortieConsumerContract(definition: CatTraitDefinition): boolean {
  return (
    definition.value.kind === "objectList" &&
    isTortieValueSchema(definition.value.schema) &&
    definition.legacy.strategy === "tortie" &&
    definition.gacha.strategy === "tortieList"
  );
}

function assertValueContract(definition: CatTraitDefinition): void {
  const { id, value } = definition;
  if (value.kind === "integer") {
    throw new Error(
      `${id}.value kind integer is not supported by the complete cat-system consumer contract`,
    );
  }
  if (!isSchemaForValueKind(value.schema, value.kind)) {
    throw new Error(
      `${id}.value kind ${value.kind} does not match its Zod schema`,
    );
  }

  const legacyStrategy = definition.legacy.strategy;
  const requiredKind =
    legacyStrategy === "pose"
      ? "string"
      : legacyStrategy === "list"
        ? "stringList"
        : legacyStrategy === "tortie"
          ? "objectList"
          : legacyStrategy === "booleanAlias"
            ? "boolean"
            : undefined;
  if (requiredKind !== undefined && value.kind !== requiredKind) {
    throw new Error(
      `${id}.legacy ${legacyStrategy} requires value kind ${requiredKind}`,
    );
  }
  if (legacyStrategy === "tortie" && !isTortieValueSchema(value.schema)) {
    throw new Error(
      `${id}.legacy tortie requires object items with string mask, pattern, and colour fields`,
    );
  }
}

function assertTraitContract(definition: CatTraitDefinition): void {
  assertValueContract(definition);
  const capabilities = definition.capabilities as unknown;
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  ) {
    throw new Error(`${definition.id}.capabilities must be an object`);
  }
  const capabilityRecord = capabilities as Record<string, unknown>;
  const entries = Object.entries(capabilityRecord);
  for (const key of Object.keys(CAPABILITY_VALIDATORS)) {
    if (!Object.hasOwn(capabilityRecord, key)) {
      throw new Error(
        `${definition.id}.capabilities must explicitly declare ${key}`,
      );
    }
  }
  for (const [key, value] of entries) {
    const validator =
      CAPABILITY_VALIDATORS[key as keyof typeof CAPABILITY_VALIDATORS];
    if (!validator) {
      throw new Error(
        `${definition.id}.capabilities has unknown decision ${key}`,
      );
    }
    if (!validator(value)) {
      throw new Error(`${definition.id}.capabilities.${key} is invalid`);
    }
  }

  if (definition.value.required && definition.value.default === undefined) {
    throw new Error(`${definition.id} is required and must declare a default`);
  }
  if (definition.value.default !== undefined) {
    const parsedDefault = definition.value.schema.safeParse(
      definition.value.default,
    );
    if (!parsedDefault.success) {
      throw new Error(
        `${definition.id} has a default that violates its schema`,
      );
    }
  }
  if (
    !definition.gacha ||
    typeof definition.gacha !== "object" ||
    !("strategy" in definition.gacha)
  ) {
    throw new Error(`${definition.id}.gacha must be an explicit decision`);
  }
}

export function defineCatTrait<const TDefinition extends CatTraitDefinition>(
  definition: TDefinition,
): TDefinition {
  assertTraitContract(definition);
  return definition;
}

export interface CatSystemDefinition<
  TTraits extends
    readonly AnyCatTraitDefinition[] = readonly AnyCatTraitDefinition[],
  TCatalogs extends Readonly<Record<string, CatalogDefinition>> = Readonly<
    Record<string, CatalogDefinition>
  >,
> {
  schemaVersion: number;
  traits: TTraits;
  catalogs: TCatalogs;
  aliases: Readonly<Record<string, string>>;
  tombstones: Readonly<Record<string, { removedIn: number; reason: string }>>;
}

export interface CatalogElementDefinition {
  id: string;
  label?: string;
  spriteKey?: string;
  poses?: readonly string[];
  weight?: number;
  deprecated?: boolean;
  /** Excludes a canonical value only from the catalog's default Gacha pool. */
  randomSelectable?: boolean;
}

export type CatalogDefinition =
  | {
      source: "peltInfo";
      keys: readonly string[];
    }
  | {
      source: "poseData";
      key: "poses" | "renderablePoseNames";
      randomSelectable?: boolean;
    }
  | {
      source: "tintData";
      file: "tint" | "white_patches_tint";
    }
  | {
      source: "coatPatterns";
    }
  | {
      source: "paletteColours";
    }
  | {
      source: "composite";
      catalogs: readonly string[];
      /**
       * Dependencies selectable by default when this composite drives Gacha.
       * Other values remain canonical for existing documents and runtime pools.
       */
      selectableCatalogs?: readonly string[];
    }
  | {
      source: "static";
      elements: readonly CatalogElementDefinition[];
    };

export type TraitDefinitionUnion<TSystem extends CatSystemDefinition> =
  TSystem["traits"][number];

type RequiredTraitDefinitions<TDefinition> = TDefinition extends {
  id: infer TId extends string;
  value: {
    required: true;
    schema: infer TSchema extends z.ZodType;
  };
}
  ? { [TKey in TId]: z.infer<TSchema> }
  : Record<never, never>;

type OptionalTraitDefinitions<TDefinition> = TDefinition extends {
  id: infer TId extends string;
  value: {
    required: false;
    schema: infer TSchema extends z.ZodType;
  };
}
  ? { [TKey in TId]?: z.infer<TSchema> }
  : Record<never, never>;

type UnionToIntersection<T> = (
  T extends unknown
    ? (value: T) => void
    : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

export type InferTraitMap<TSystem extends CatSystemDefinition> =
  UnionToIntersection<RequiredTraitDefinitions<TraitDefinitionUnion<TSystem>>> &
    UnionToIntersection<
      OptionalTraitDefinitions<TraitDefinitionUnion<TSystem>>
    >;

export type CatDocumentFor<TSystem extends CatSystemDefinition> = {
  schemaVersion: TSystem["schemaVersion"];
  traits: InferTraitMap<TSystem>;
  unknownTraits?: Record<string, JsonValue>;
};

function assertProbability(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
}

function validateCount(
  count: CountDistribution,
  label: string,
  maxItems?: number,
): void {
  if (!Number.isInteger(count.min) || !Number.isInteger(count.max)) {
    throw new Error(`${label} count bounds must be integers`);
  }
  if (count.min < 0 || count.max < count.min) {
    throw new Error(`${label} has an invalid count range`);
  }
  if (maxItems !== undefined && count.max > maxItems) {
    throw new Error(`${label} can generate more than maxItems=${maxItems}`);
  }
  if (count.strategy === "weightedDiscrete") {
    const entries = Object.entries(count.weights);
    if (entries.length === 0) {
      throw new Error(`${label} needs at least one count weight`);
    }
    let total = 0;
    for (const [rawValue, weight] of entries) {
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value < count.min || value > count.max) {
        throw new Error(
          `${label} has an unreachable weighted value ${rawValue}`,
        );
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(`${label} has a non-positive weight for ${rawValue}`);
      }
      total += weight;
    }
    if (total <= 0) {
      throw new Error(`${label} has an empty weight sum`);
    }
  }
}

function assertAcyclic(
  nodes: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]>,
  label: string,
): void {
  const nodeSet = new Set(nodes);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      throw new Error(`${label} contains a cycle at ${node}`);
    }
    visiting.add(node);
    for (const dependency of dependencies.get(node) ?? []) {
      if (!nodeSet.has(dependency)) {
        throw new Error(`${label} ${node} depends on unknown ${dependency}`);
      }
      visit(dependency);
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of nodes) visit(node);
}

export function defineCatSystem<
  const TTraits extends readonly AnyCatTraitDefinition[],
  const TCatalogs extends Readonly<Record<string, CatalogDefinition>>,
>(
  definition: CatSystemDefinition<TTraits, TCatalogs>,
): CatSystemDefinition<TTraits, TCatalogs> {
  if (
    !Number.isInteger(definition.schemaVersion) ||
    definition.schemaVersion < 1
  ) {
    throw new Error("schemaVersion must be a positive integer");
  }

  const ids = new Set<string>();
  const catalogIds = new Set(Object.keys(definition.catalogs));
  const operations = new Map<string, RenderOperationBinding>();
  const operationOwners = new Map<string, string>();
  const gachaGateProbabilities = new Map<string, number>();
  for (const trait of definition.traits) {
    assertTraitContract(trait);
    if (
      !/^[a-z][A-Za-z0-9]*$/.test(trait.id) &&
      !/^__probe_[a-z0-9]+$/.test(trait.id)
    ) {
      throw new Error(`Invalid trait id ${trait.id}`);
    }
    if (ids.has(trait.id)) throw new Error(`Duplicate trait id ${trait.id}`);
    ids.add(trait.id);
    if (trait.value.catalog && !catalogIds.has(trait.value.catalog)) {
      throw new Error(
        `${trait.id} uses unknown catalog ${trait.value.catalog}`,
      );
    }
    const edit = trait.capabilities.edit;
    if (edit === "toggle" && trait.value.kind !== "boolean") {
      throw new Error(`${trait.id}.edit toggle requires a boolean value`);
    }
    if (edit === "select" && trait.value.kind !== "string") {
      throw new Error(`${trait.id}.edit select requires a string value`);
    }
    if (edit === "list" && trait.value.kind !== "stringList") {
      throw new Error(`${trait.id}.edit list requires a stringList value`);
    }
    if (edit === "compoundList" && trait.value.kind !== "objectList") {
      throw new Error(
        `${trait.id}.edit compoundList requires an objectList value`,
      );
    }
    const reveal = trait.capabilities.reveal;
    if (reveal) {
      if (
        reveal.spin !== false &&
        reveal.spin?.order !== undefined &&
        !Number.isFinite(reveal.spin.order)
      ) {
        throw new Error(`${trait.id}.reveal.spin.order must be finite`);
      }
      if (
        reveal.spin !== false &&
        reveal.spin?.label !== undefined &&
        !reveal.spin.label.trim()
      ) {
        throw new Error(`${trait.id}.reveal.spin.label must not be empty`);
      }
      if (
        reveal.strategy === "single" &&
        trait.value.kind !== "boolean" &&
        !hasCatalogBackedValue(trait, catalogIds, "string")
      ) {
        throw new Error(
          `${trait.id}.reveal single requires a boolean or catalog-backed string value`,
        );
      }
      if (
        reveal.strategy === "slots" &&
        !hasCatalogBackedValue(trait, catalogIds, "stringList")
      ) {
        throw new Error(
          `${trait.id}.reveal slots requires a catalog-backed stringList value`,
        );
      }
      if (
        reveal.strategy === "compoundSlots" &&
        trait.value.kind !== "objectList"
      ) {
        throw new Error(
          `${trait.id}.reveal compoundSlots requires an objectList value`,
        );
      }
    }
    if (
      trait.capabilities.inherit === "mutate" &&
      !hasCatalogBackedValue(trait, catalogIds, "string") &&
      !hasCatalogBackedValue(trait, catalogIds, "stringList") &&
      !hasTortieConsumerContract(trait)
    ) {
      throw new Error(
        `${trait.id}.inherit mutate requires a catalog-backed string or stringList value, or the tortie objectList contract`,
      );
    }
    if (
      trait.capabilities.evolution === "accumulate" &&
      trait.value.kind !== "stringList" &&
      trait.value.kind !== "objectList"
    ) {
      throw new Error(`${trait.id}.evolution accumulate requires a list value`);
    }
    if (
      ![
        "none",
        "catalogChoice",
        "boolean",
        "slotList",
        "tortieList",
        "derived",
      ].includes(trait.gacha.strategy)
    ) {
      throw new Error(`${trait.id}.gacha has an unknown strategy`);
    }
    if (
      trait.gacha.strategy !== "none" &&
      trait.gacha.strategy !== "derived" &&
      trait.gacha.gate
    ) {
      const gate = trait.gacha.gate;
      if (!gate.group.trim()) {
        throw new Error(`${trait.id}.gacha.gate.group must not be empty`);
      }
      assertProbability(gate.probability, `${trait.id}.gacha.gate.probability`);
      const existingProbability = gachaGateProbabilities.get(gate.group);
      if (
        existingProbability !== undefined &&
        existingProbability !== gate.probability
      ) {
        throw new Error(
          `${trait.id}.gacha.gate ${gate.group} disagrees on probability`,
        );
      }
      gachaGateProbabilities.set(gate.group, gate.probability);
    }
    if (
      trait.capabilities.settings &&
      trait.gacha.strategy !== "slotList" &&
      trait.gacha.strategy !== "tortieList"
    ) {
      throw new Error(
        `${trait.id}.settings is reserved for explicit slot-count controls`,
      );
    }
    const renderBindings = Array.isArray(trait.render)
      ? trait.render
      : [trait.render];
    for (const binding of renderBindings) {
      if (binding.kind !== "operation") continue;
      if (operations.has(binding.operationId)) {
        throw new Error(`Duplicate render operation ${binding.operationId}`);
      }
      operations.set(binding.operationId, binding);
      operationOwners.set(binding.operationId, trait.id);
    }

    if (trait.gacha.strategy === "catalogChoice") {
      if (trait.value.kind !== "string") {
        throw new Error(
          `${trait.id}.gacha catalogChoice requires a string value`,
        );
      }
      if (!catalogIds.has(trait.gacha.catalog)) {
        throw new Error(
          `${trait.id}.gacha uses unknown catalog ${trait.gacha.catalog}`,
        );
      }
      if (trait.gacha.includeUnsetChoice && trait.value.required) {
        throw new Error(
          `${trait.id}.gacha includeUnsetChoice requires an optional value`,
        );
      }
      for (const conditional of trait.gacha.conditionalCatalogs ?? []) {
        if (!catalogIds.has(conditional.catalog)) {
          throw new Error(
            `${trait.id}.gacha uses unknown conditional catalog ${conditional.catalog}`,
          );
        }
      }
      assertProbability(
        trait.gacha.optionalProbability,
        `${trait.id}.gacha.optionalProbability`,
      );
    } else if (trait.gacha.strategy === "boolean") {
      if (trait.value.kind !== "boolean") {
        throw new Error(`${trait.id}.gacha boolean requires a boolean value`);
      }
      assertProbability(
        trait.gacha.probability,
        `${trait.id}.gacha.probability`,
      );
    } else if (trait.gacha.strategy === "slotList") {
      if (trait.value.kind !== "stringList") {
        throw new Error(
          `${trait.id}.gacha slotList requires a stringList value`,
        );
      }
      if (trait.value.unique === true && trait.gacha.unique !== true) {
        throw new Error(
          `${trait.id}.gacha must select unique values because its value contract is unique`,
        );
      }
      if (!catalogIds.has(trait.gacha.catalog)) {
        throw new Error(
          `${trait.id}.gacha uses unknown catalog ${trait.gacha.catalog}`,
        );
      }
      if (trait.value.catalog !== trait.gacha.catalog) {
        throw new Error(
          `${trait.id}.gacha slotList catalog ${trait.gacha.catalog} must match value catalog ${trait.value.catalog ?? "<missing>"}; use an explicit projection strategy for different catalogs`,
        );
      }
      assertProbability(
        trait.gacha.fillProbability,
        `${trait.id}.gacha.fillProbability`,
      );
      validateCount(
        trait.gacha.count,
        `${trait.id}.gacha`,
        trait.value.maxItems,
      );
    } else if (trait.gacha.strategy === "tortieList") {
      if (trait.value.kind !== "objectList") {
        throw new Error(
          `${trait.id}.gacha tortieList requires an objectList value`,
        );
      }
      for (const catalogId of [
        trait.gacha.maskCatalog,
        trait.gacha.peltCatalog,
        trait.gacha.colourCatalog,
      ]) {
        if (!catalogIds.has(catalogId)) {
          throw new Error(
            `${trait.id}.gacha uses unknown catalog ${catalogId}`,
          );
        }
      }
      assertProbability(
        trait.gacha.activationProbability,
        `${trait.id}.gacha.activationProbability`,
      );
      assertProbability(
        trait.gacha.fillProbability,
        `${trait.id}.gacha.fillProbability`,
      );
      validateCount(
        trait.gacha.count,
        `${trait.id}.gacha`,
        trait.value.maxItems,
      );
    } else if (trait.gacha.strategy === "derived") {
      if (trait.value.kind !== "string") {
        throw new Error(`${trait.id}.gacha derived requires a string value`);
      }
      if (trait.gacha.resolver !== "coatChoiceProjection") {
        throw new Error(`${trait.id}.gacha uses an unknown derived resolver`);
      }
      if (!trait.gacha.sourceTrait.trim()) {
        throw new Error(`${trait.id}.gacha.sourceTrait must not be empty`);
      }
      if (!trait.gacha.dependsOn.includes(trait.gacha.sourceTrait)) {
        throw new Error(
          `${trait.id}.gacha must depend on source trait ${trait.gacha.sourceTrait}`,
        );
      }
    }
  }

  const traitById = new Map(
    definition.traits.map((trait) => [trait.id, trait] as const),
  );
  for (const trait of definition.traits) {
    if (trait.gacha.strategy === "catalogChoice") {
      for (const conditional of trait.gacha.conditionalCatalogs ?? []) {
        const conditionTrait = traitById.get(conditional.whenTrait);
        if (!conditionTrait) {
          throw new Error(
            `${trait.id}.gacha conditional catalog references unknown trait ${conditional.whenTrait}`,
          );
        }
        if (
          conditional.condition === "nonEmptyList" &&
          conditionTrait.value.kind !== "stringList" &&
          conditionTrait.value.kind !== "objectList"
        ) {
          throw new Error(
            `${trait.id}.gacha nonEmptyList condition requires a list trait`,
          );
        }
        if (!(trait.gacha.dependsOn ?? []).includes(conditional.whenTrait)) {
          throw new Error(
            `${trait.id}.gacha must depend on conditional trait ${conditional.whenTrait}`,
          );
        }
      }
    }
    if (trait.gacha.strategy !== "derived") continue;
    const sourceTrait = traitById.get(trait.gacha.sourceTrait);
    if (!sourceTrait) {
      throw new Error(
        `${trait.id}.gacha derives from unknown trait ${trait.gacha.sourceTrait}`,
      );
    }
    if (sourceTrait.value.kind !== "string") {
      throw new Error(
        `${trait.id}.gacha resolver ${trait.gacha.resolver} requires a string source trait`,
      );
    }
  }

  for (const [catalogId, catalog] of Object.entries(definition.catalogs)) {
    if (catalog.source === "composite") {
      for (const dependency of catalog.catalogs) {
        if (!catalogIds.has(dependency)) {
          throw new Error(
            `${catalogId} includes unknown catalog ${dependency}`,
          );
        }
        if (dependency === catalogId) {
          throw new Error(`${catalogId} cannot include itself`);
        }
      }
      for (const selectable of catalog.selectableCatalogs ?? []) {
        if (!catalog.catalogs.includes(selectable)) {
          throw new Error(
            `${catalogId}.selectableCatalogs includes non-member ${selectable}`,
          );
        }
      }
    } else if (catalog.source === "static") {
      const elementIds = new Set<string>();
      for (const element of catalog.elements) {
        if (!element.id.trim())
          throw new Error(`${catalogId} has an empty element id`);
        if (elementIds.has(element.id)) {
          throw new Error(`${catalogId} has duplicate element ${element.id}`);
        }
        elementIds.add(element.id);
        if (
          element.weight !== undefined &&
          (!Number.isFinite(element.weight) || element.weight <= 0)
        ) {
          throw new Error(`${catalogId}.${element.id} has an invalid weight`);
        }
      }
    }
  }

  for (const trait of definition.traits) {
    const renderBindings = Array.isArray(trait.render)
      ? trait.render
      : [trait.render];
    for (const binding of renderBindings) {
      if (binding.kind !== "input") continue;
      const operation = operations.get(binding.operationId);
      if (!operation) {
        throw new Error(
          `${trait.id} references unknown render operation ${binding.operationId}`,
        );
      }
      if (!(operation.reads ?? []).includes(trait.id)) {
        throw new Error(
          `${trait.id} render input ${binding.operationId} must declare ${trait.id} in reads`,
        );
      }
    }
  }

  const operationDependencies = new Map<string, readonly string[]>();
  for (const [id, operation] of operations) {
    operationDependencies.set(id, operation.after ?? []);
    const config = operation.config as Record<string, unknown>;
    for (const configKey of ["valueTrait", "tintTrait"] as const) {
      const traitId = config[configKey];
      if (typeof traitId !== "string") continue;
      if (!ids.has(traitId)) {
        throw new Error(
          `${id}.config.${configKey} references unknown trait ${traitId}`,
        );
      }
      if (!(operation.reads ?? []).includes(traitId)) {
        throw new Error(`${id}.config.${configKey} must be declared in reads`);
      }
    }
    if (
      operation.strategy === "catalogSpriteList" &&
      !catalogIds.has(operation.config.catalog)
    ) {
      throw new Error(
        `${id}.config uses unknown catalog ${operation.config.catalog}`,
      );
    }
    for (const traitId of operation.reads ?? []) {
      if (!ids.has(traitId)) {
        throw new Error(`${id} reads unknown trait ${traitId}`);
      }
    }

    const requireConfiguredTraitKind = (
      configKey: "valueTrait" | "tintTrait",
      expectedKind: TraitValueKind,
    ): void => {
      const traitId = config[configKey];
      if (typeof traitId !== "string") {
        throw new Error(`${id}.config.${configKey} must reference a trait`);
      }
      const configuredTrait = traitById.get(traitId);
      if (!configuredTrait) return;
      if (configuredTrait.value.kind !== expectedKind) {
        throw new Error(
          `${id}.${operation.strategy} requires ${configKey} ${traitId} to use a ${expectedKind} value`,
        );
      }
    };

    if (operation.strategy === "spriteLayer") {
      requireConfiguredTraitKind("valueTrait", "string");
      if (operation.config.tintTrait !== undefined) {
        requireConfiguredTraitKind("tintTrait", "string");
      }
    } else if (operation.strategy === "catalogSpriteList") {
      requireConfiguredTraitKind("valueTrait", "stringList");
    } else if (
      operation.strategy === "booleanSpriteLayer" ||
      operation.strategy === "solidMultiply" ||
      operation.strategy === "globalMirror"
    ) {
      requireConfiguredTraitKind("valueTrait", "boolean");
    } else if (operation.strategy === "tintMultiply") {
      const ownerId = operationOwners.get(id);
      const owner = ownerId === undefined ? undefined : traitById.get(ownerId);
      if (owner && owner.value.kind !== "string") {
        throw new Error(
          `${id}.tintMultiply requires owner trait ${owner.id} to use a string value`,
        );
      }
    }
  }
  assertAcyclic(
    [...operations.keys()],
    operationDependencies,
    "render operation graph",
  );

  const gachaDependencies = new Map(
    definition.traits.map((trait) => [
      trait.id,
      trait.gacha.strategy === "none" ? [] : (trait.gacha.dependsOn ?? []),
    ]),
  );
  assertAcyclic([...ids], gachaDependencies, "gacha dependency graph");

  for (const [alias, target] of Object.entries(definition.aliases)) {
    if (ids.has(alias))
      throw new Error(`Alias ${alias} shadows an active trait`);
    if (!ids.has(target))
      throw new Error(`Alias ${alias} targets unknown ${target}`);
    if (definition.tombstones[alias]) {
      throw new Error(`${alias} cannot be both an alias and a tombstone`);
    }
  }

  return definition;
}

type ValueRequirement<TValue, TRequired extends boolean> = {
  required: TRequired;
} & (TRequired extends true ? { default: TValue } : { default?: TValue });

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : stableJsonValue(entry),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
}

function stableStructuralKey(value: unknown): string {
  return JSON.stringify(stableJsonValue(value)) ?? "undefined";
}

function requireStructurallyUniqueItems<TSchema extends z.ZodType>(
  schema: z.ZodArray<TSchema>,
  unique: boolean,
): z.ZodArray<TSchema> {
  if (!unique) return schema;
  return schema.superRefine((values, context) => {
    const firstIndexByValue = new Map<string, number>();
    values.forEach((value, index) => {
      const key = stableStructuralKey(value);
      const firstIndex = firstIndexByValue.get(key);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate list item; structurally identical to item ${firstIndex}`,
        });
      } else {
        firstIndexByValue.set(key, index);
      }
    });
  });
}

export function stringValue<const TRequired extends boolean>(
  options: ValueRequirement<string, TRequired> & { catalog?: string },
): TraitValueDefinition<z.ZodString, TRequired> {
  return {
    kind: "string",
    schema: z.string(),
    ...options,
  } as unknown as TraitValueDefinition<z.ZodString, TRequired>;
}

export function booleanValue<const TRequired extends boolean>(
  options: ValueRequirement<boolean, TRequired>,
): TraitValueDefinition<z.ZodBoolean, TRequired> {
  return {
    kind: "boolean",
    schema: z.boolean(),
    ...options,
  } as unknown as TraitValueDefinition<z.ZodBoolean, TRequired>;
}

export function stringListValue<const TRequired extends boolean>(
  options: ValueRequirement<string[], TRequired> & {
    catalog: string;
    maxItems: number;
    unique?: boolean;
  },
): TraitValueDefinition<z.ZodArray<z.ZodString>, TRequired> {
  const unique = options.unique ?? true;
  const schema = requireStructurallyUniqueItems(
    z.array(z.string()).max(options.maxItems),
    unique,
  );
  return {
    kind: "stringList",
    schema,
    ...options,
    unique,
  } as unknown as TraitValueDefinition<z.ZodArray<z.ZodString>, TRequired>;
}

export function objectListValue<
  TSchema extends z.ZodType,
  const TRequired extends boolean,
>(
  options: {
    required: TRequired;
    schema: TSchema;
    maxItems: number;
    unique?: boolean;
  } & (TRequired extends true
    ? { default: z.infer<TSchema>[] }
    : { default?: z.infer<TSchema>[] }),
): TraitValueDefinition<z.ZodArray<TSchema>, TRequired> {
  const schema = requireStructurallyUniqueItems(
    z.array(options.schema).max(options.maxItems),
    options.unique === true,
  );
  return {
    kind: "objectList",
    schema,
    required: options.required,
    default: options.default,
    maxItems: options.maxItems,
    unique: options.unique,
  } as TraitValueDefinition<z.ZodArray<TSchema>, TRequired>;
}
