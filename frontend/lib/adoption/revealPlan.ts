import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
} from "@/lib/cat-system/definition";
import { catSystem } from "@/lib/cat-system/registry";
import {
  getSystemRevealPlan,
  getSystemRevealTraits,
} from "@/lib/cat-system/runtime";

export type AdoptionRevealStage = {
  id: string;
  traitId: string;
  label: string;
  type: "simple" | "slot" | "accessory" | "scar" | "tortie-sub";
  strategy: "single" | "slots" | "compoundSlots";
  param: string;
  timingKey: string;
  defaultSteps: number;
  slotIndex?: number;
  layerIndex?: number;
  subElement?: "mask" | "pattern" | "colour";
};

function fallbackValue(trait: AnyCatTraitDefinition): unknown {
  if (trait.value.default !== undefined) return trait.value.default;
  switch (trait.value.kind) {
    case "boolean":
      return false;
    case "integer":
      return 0;
    case "stringList":
    case "objectList":
      return [];
    case "string":
      return "none";
  }
}

function legacyParam(trait: AnyCatTraitDefinition): string {
  switch (trait.legacy.strategy) {
    case "direct":
    case "list":
    case "booleanAlias":
      return trait.legacy.key;
    case "pose":
      return trait.legacy.key;
    case "tortie":
      return "tortie";
  }
}

function slotType(timingKey: string): AdoptionRevealStage["type"] {
  if (timingKey === "accessory") return "accessory";
  if (timingKey === "scar") return "scar";
  return "slot";
}

function singularLabel(label: string): string {
  if (/ies$/i.test(label)) return label.replace(/ies$/i, "y");
  return label.replace(/s$/i, "");
}

export function buildAdoptionInitialTraits(options: {
  finalTraits: Readonly<Record<string, unknown>>;
  overrides?: Readonly<Record<string, unknown>>;
  system?: CatSystemDefinition;
}): Record<string, unknown> {
  const system = options.system ?? catSystem;
  const traits: Record<string, unknown> = structuredClone({
    ...options.finalTraits,
  });
  for (const trait of getSystemRevealTraits(system)) {
    if (options.overrides && trait.id in options.overrides) {
      traits[trait.id] = structuredClone(options.overrides[trait.id]);
      continue;
    }
    if (
      trait.value.kind === "stringList" ||
      trait.value.kind === "objectList"
    ) {
      traits[trait.id] = [];
      continue;
    }
    if (trait.value.default !== undefined) {
      traits[trait.id] = structuredClone(trait.value.default);
    } else if (trait.value.required) {
      traits[trait.id] = fallbackValue(trait);
    } else {
      delete traits[trait.id];
    }
  }
  return traits;
}

export function buildAdoptionRevealPlan(options: {
  traits: Readonly<Record<string, unknown>>;
  slotCounts?: Readonly<Record<string, number>>;
  system?: CatSystemDefinition;
}): AdoptionRevealStage[] {
  const system = options.system ?? catSystem;
  const planningTraits: Record<string, unknown> = { ...options.traits };
  const definitionById = new Map(
    system.traits.map((trait) => [trait.id, trait] as const),
  );

  for (const trait of getSystemRevealTraits(system)) {
    const reveal = trait.capabilities.reveal;
    if (!reveal) continue;
    const requestedSlots = Math.max(
      0,
      Math.trunc(options.slotCounts?.[trait.id] ?? 0),
    );
    if (reveal.strategy !== "single" && requestedSlots > 0) {
      const existing = Array.isArray(planningTraits[trait.id])
        ? [...(planningTraits[trait.id] as unknown[])]
        : [];
      while (existing.length < requestedSlots) existing.push(null);
      planningTraits[trait.id] = existing.slice(0, requestedSlots);
    } else if (planningTraits[trait.id] === undefined) {
      planningTraits[trait.id] = fallbackValue(trait);
    }
  }

  return getSystemRevealPlan(
    system,
    planningTraits,
  ).flatMap<AdoptionRevealStage>((stage): AdoptionRevealStage[] => {
    const trait = definitionById.get(stage.traitId);
    if (!trait) return [];
    const param = legacyParam(trait);
    const base = {
      traitId: stage.traitId,
      strategy: stage.strategy,
      param,
      timingKey: stage.timingKey,
      defaultSteps: stage.defaultSteps,
    } as const;

    if (
      stage.strategy === "compoundSlots" &&
      trait.legacy.strategy === "tortie"
    ) {
      const layerIndex = stage.slotIndex ?? 0;
      return (["mask", "pattern", "colour"] as const).map((subElement) => ({
        ...base,
        id: `${stage.traitId}-${layerIndex}-${subElement}`,
        label: `${trait.label.replace(/ layers$/i, "")} ${layerIndex + 1} ${
          subElement === "pattern"
            ? "Pelt"
            : subElement[0].toUpperCase() + subElement.slice(1)
        }`,
        type: "tortie-sub" as const,
        layerIndex,
        slotIndex: layerIndex,
        subElement,
      }));
    }

    if (stage.strategy !== "single") {
      const slotIndex = stage.slotIndex ?? 0;
      return [
        {
          ...base,
          id: `${stage.traitId}-${slotIndex}`,
          label: `${singularLabel(trait.label)} ${slotIndex + 1}`,
          type: slotType(stage.timingKey),
          slotIndex,
        },
      ];
    }

    return [
      {
        ...base,
        id: stage.traitId,
        label: trait.label,
        type: "simple" as const,
      },
    ];
  });
}
