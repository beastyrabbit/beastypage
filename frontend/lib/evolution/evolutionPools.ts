import { getAllColorDefs } from "@/lib/palettes";
import { buildClanColourSets } from "./clanPalettes";
import type { EvolutionArchetype, EvolutionPools } from "./evolutionGenerator";

export type EvolutionPoolMapper = {
  getTortieMasks(): string[];
  getPeltNames(): string[];
  getColours(): string[];
  getPlantAccessories(): string[];
  getWildAccessories(): string[];
  getCollars(): string[];
  getAccessories?(): string[];
  getScars?(): string[];
  getScarsByCategory?(category: number): string[];
  getExperimentalColours?(): string[];
};

export function readMapperArray(
  mapper: EvolutionPoolMapper,
  method: keyof EvolutionPoolMapper,
  ...args: unknown[]
) {
  const fn = mapper[method];
  if (typeof fn !== "function") return [];
  try {
    const value = Reflect.apply(fn, mapper, args) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch (_error) {
    return [];
  }
}

function buildColourDefinitions() {
  return Object.fromEntries(
    Object.entries(getAllColorDefs())
      .filter(([, definition]) => Array.isArray(definition.multiply))
      .map(([name, definition]) => [
        name.toUpperCase(),
        definition.multiply as [number, number, number],
      ]),
  );
}

export function buildEvolutionPools(
  mapper: EvolutionPoolMapper,
): EvolutionPools {
  const plantAccessories = readMapperArray(mapper, "getPlantAccessories");
  const wildAccessories = readMapperArray(mapper, "getWildAccessories");
  const collarAccessories = readMapperArray(mapper, "getCollars");
  const allAccessories = mapper.getAccessories?.() ?? [
    ...plantAccessories,
    ...wildAccessories,
    ...collarAccessories,
  ];
  const knownAccessories = new Set([
    ...plantAccessories,
    ...wildAccessories,
    ...collarAccessories,
  ]);
  const extraAccessories = allAccessories.filter(
    (accessory) => !knownAccessories.has(accessory),
  );
  const scars = mapper.getScars?.() ?? [
    ...readMapperArray(mapper, "getScarsByCategory", 1),
    ...readMapperArray(mapper, "getScarsByCategory", 2),
    ...readMapperArray(mapper, "getScarsByCategory", 3),
  ];

  const experimentalColours =
    mapper.getExperimentalColours?.() ?? Object.keys(getAllColorDefs());
  const renderable = new Set(
    experimentalColours.map((colour) => colour.toUpperCase()),
  );
  const clanColours = Object.fromEntries(
    Object.entries(buildClanColourSets()).map(([clan, colours]) => [
      clan,
      colours.filter((colour) => renderable.has(colour.toUpperCase())),
    ]),
  ) as Partial<Record<EvolutionArchetype, string[]>>;

  return {
    tortieMasks: readMapperArray(mapper, "getTortieMasks"),
    tortiePatterns: readMapperArray(mapper, "getPeltNames").filter(
      (name) => name !== "Tortie" && name !== "Calico",
    ),
    baseColours: readMapperArray(mapper, "getColours"),
    experimentalColours,
    accessories: allAccessories,
    plantAccessories,
    wildAccessories,
    collarAccessories,
    extraAccessories,
    scars,
    colourDefinitions: buildColourDefinitions(),
    clanColours,
  };
}
