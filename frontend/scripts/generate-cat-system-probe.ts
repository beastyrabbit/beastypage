import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AnyCatTraitDefinition,
  RenderBinding,
} from "../lib/cat-system/definition";
import {
  createGachaCatalogsFromPublicCatalog,
  rollCatFromSystem,
} from "../lib/cat-system/gacha";
import { getSystemOrderedRenderOperations } from "../lib/cat-system/runtime";
import {
  EAR_ACCESSORY_PROBE_ELEMENTS,
  EAR_ACCESSORY_PROBE_FIXED_TRAITS,
  EAR_ACCESSORY_PROBE_ID,
  EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
  EAR_ACCESSORY_PROBE_SEED,
  earAccessoryProbeSystem,
  earAccessoryProbeTrait,
} from "../lib/cat-system/testing/earAccessoryProbe";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const productPlanPath = resolve(
  repositoryRoot,
  "backend/renderer_service/renderer_service/generated/render-plan.json",
);
const productPublicCatalogPath = resolve(
  repositoryRoot,
  "frontend/public/cat-system/public-cat-catalog.json",
);
const fixturePath = resolve(
  scriptDirectory,
  "../lib/cat-system/testing/fixtures/cat-system-ear-accessory-probe.generated.json",
);
const checkOnly = process.argv.includes("--check");

interface ProductRenderPlan {
  formatVersion: 1;
  schemaVersion: number;
  catalogHash: string;
  manifestHash: string;
  catalogs: Record<
    string,
    Array<{
      id: string;
      label: string;
      spriteKey?: string;
      poses?: string[];
      deprecated?: boolean;
    }>
  >;
}

interface ProductPublicCatalog {
  schemaVersion: number;
  catalogHash: string;
  catalogs: Record<
    string,
    Array<{
      id: string;
      poses?: string[];
      deprecated?: boolean;
      randomSelectable?: boolean;
      weight?: number;
    }>
  >;
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

function stableStringify(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function renderBindings(
  render: RenderBinding | readonly RenderBinding[],
): readonly RenderBinding[] {
  return "kind" in render ? [render] : render;
}

function compatibilityTrait(trait: AnyCatTraitDefinition) {
  return {
    id: trait.id,
    valueKind: trait.value.kind,
    required: trait.value.required,
    ...(trait.value.default === undefined
      ? {}
      : { default: trait.value.default }),
    legacy: trait.legacy,
  };
}

function buildArtifact(): unknown {
  if (!existsSync(productPlanPath)) {
    throw new Error(
      `Generate the product cat-system before its probe: ${productPlanPath}`,
    );
  }
  if (!existsSync(productPublicCatalogPath)) {
    throw new Error(
      `Generate the public cat-system catalog before its probe: ${productPublicCatalogPath}`,
    );
  }
  const productPlan = readJson<ProductRenderPlan>(productPlanPath);
  const productPublicCatalog = readJson<ProductPublicCatalog>(
    productPublicCatalogPath,
  );
  if (
    productPublicCatalog.schemaVersion !== productPlan.schemaVersion ||
    productPublicCatalog.catalogHash !== productPlan.catalogHash
  ) {
    throw new Error(
      "The public cat catalog and renderer plan must describe the same generated cat-system build",
    );
  }
  const probeCatalog = EAR_ACCESSORY_PROBE_ELEMENTS.map((element) => ({
    ...element,
    poses: [...element.poses],
  }));
  // The executor needs only catalogs read by values present in the probe
  // documents. Keeping this contract catalog-only avoids copying the much
  // larger product artifact into a test fixture.
  const catalogs = { [EAR_ACCESSORY_PROBE_ID]: probeCatalog };
  const gachaCatalogs = createGachaCatalogsFromPublicCatalog({
    catalogs: {
      // Gacha consumes the public catalog because it carries selection-only
      // metadata such as randomSelectable. The renderer plan intentionally
      // omits that metadata because rendering does not use it.
      ...productPublicCatalog.catalogs,
      ...catalogs,
    },
  });
  const gachaOptions = {
    seed: EAR_ACCESSORY_PROBE_SEED,
    exactLayerCounts: true,
    fixedTraits: EAR_ACCESSORY_PROBE_FIXED_TRAITS,
  };
  const gacha = rollCatFromSystem(
    earAccessoryProbeSystem,
    gachaCatalogs,
    gachaOptions,
  );
  const renderRoll = rollCatFromSystem(earAccessoryProbeSystem, gachaCatalogs, {
    seed: EAR_ACCESSORY_PROBE_SEED,
    exactLayerCounts: true,
    fixedTraits: {
      ...EAR_ACCESSORY_PROBE_FIXED_TRAITS,
      [EAR_ACCESSORY_PROBE_ID]: [EAR_ACCESSORY_PROBE_PRIMARY_VALUE],
    },
  });
  const renderDocument = renderRoll.document;
  const baseDocument = {
    ...renderDocument,
    traits: {
      ...renderDocument.traits,
      [EAR_ACCESSORY_PROBE_ID]: [],
    },
  };
  const operations = getSystemOrderedRenderOperations(
    earAccessoryProbeSystem,
  ).map((operation, order) => ({
    id: operation.operationId,
    layerId: operation.layerId,
    strategy: operation.strategy,
    strategyVersion: operation.version,
    dependsOn: operation.after ?? [],
    order,
    reads: operation.reads ?? [],
    config: operation.config,
  }));
  const compatibility = {
    formatVersion: 1,
    schemaVersion: earAccessoryProbeSystem.schemaVersion,
    aliases: earAccessoryProbeSystem.aliases,
    tombstones: earAccessoryProbeSystem.tombstones,
    traits: earAccessoryProbeSystem.traits.map(compatibilityTrait),
  };
  const probeDefinition = {
    id: earAccessoryProbeTrait.id,
    label: earAccessoryProbeTrait.label,
    order: earAccessoryProbeTrait.order,
    value: {
      kind: earAccessoryProbeTrait.value.kind,
      required: earAccessoryProbeTrait.value.required,
      default: earAccessoryProbeTrait.value.default,
      catalog: earAccessoryProbeTrait.value.catalog,
      maxItems: earAccessoryProbeTrait.value.maxItems,
      unique: earAccessoryProbeTrait.value.unique,
    },
    legacy: earAccessoryProbeTrait.legacy,
    render: renderBindings(earAccessoryProbeTrait.render),
    renderOperations: renderBindings(earAccessoryProbeTrait.render)
      .filter((binding) => binding.kind !== "context")
      .map((binding) => binding.operationId),
    gacha: earAccessoryProbeTrait.gacha,
    capabilities: earAccessoryProbeTrait.capabilities,
  };
  const catalogHash = hashValue({
    schemaVersion: earAccessoryProbeSystem.schemaVersion,
    probeDefinition,
    catalogs,
    operations,
    compatibility,
  });
  const renderPlan = {
    formatVersion: productPlan.formatVersion,
    schemaVersion: earAccessoryProbeSystem.schemaVersion,
    catalogHash,
    manifestHash: productPlan.manifestHash,
    operations,
    catalogs,
  };

  return {
    formatVersion: 1,
    generatedBy: "frontend/scripts/generate-cat-system-probe.ts",
    probeId: EAR_ACCESSORY_PROBE_ID,
    probeDefinition,
    gacha: {
      seed: gacha.seed,
      rngVersion: gacha.rngVersion,
      document: gacha.document,
      slotSelections: gacha.slotSelections,
    },
    baseDocument,
    renderDocument,
    compatibility,
    renderPlan,
  };
}

const content = stableStringify(buildArtifact());
if (checkOnly) {
  if (
    !existsSync(fixturePath) ||
    readFileSync(fixturePath, "utf8") !== content
  ) {
    throw new Error(
      `Generated cat-system probe fixture is stale: ${fixturePath}`,
    );
  }
  console.log(`Checked shared cat-system probe ${EAR_ACCESSORY_PROBE_ID}`);
} else {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, content);
  console.log(`Generated shared cat-system probe ${EAR_ACCESSORY_PROBE_ID}`);
}
