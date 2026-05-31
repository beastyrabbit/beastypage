import { describe, expect, it } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  generateEvolutionBatch,
  getTortieLayerParts,
  isNearStarterColour,
  normalizeEvolutionStarter,
  type EvolutionPools,
} from "../evolutionGenerator";

const starterParams: CatParams = {
  spriteNumber: 7,
  peltName: "Tabby",
  colour: "GINGER",
  eyeColour: "GREEN",
  skinColour: "PINK",
  tint: "none",
  shading: true,
  reverse: false,
  isTortie: true,
  tortie: [{ mask: "ONE", pattern: "SingleColour", colour: "BLACK" }],
  tortieMask: "ONE",
  tortiePattern: "SingleColour",
  tortieColour: "BLACK",
  accessories: ["MAPLE LEAF"],
  accessory: "MAPLE LEAF",
  scars: ["ONE"],
  scar: "ONE",
};

const pools: EvolutionPools = {
  tortieMasks: ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN"],
  tortiePatterns: ["SingleColour", "Tabby", "Marbled"],
  baseColours: [
    "WHITE",
    "SILVER",
    "PALEGREY",
    "GHOST",
    "BLACK",
    "GREY",
    "DARKGREY",
    "GOLDEN",
    "CREAM",
    "PALEGINGER",
    "LIGHTBROWN",
    "BROWN",
    "GOLDEN-BROWN",
    "LILAC",
  ],
  experimentalColours: [
    "AQUA",
    "TURQUOISE",
    "CHARTREUSE",
    "NEONGREEN",
    "EMERALD",
    "SPRINGGREEN",
    "SS_SILVERSCREEN",
    "CS_POLISHED",
    "RA_CRYSTALPURPLE",
    "AW_CLEARICE",
    "RG_GARDENROSE",
    "NEONPINK",
    "CS_BLUESTEEL",
    "SC_STEELGRAY",
    "MV_VOIDNAVY",
    "SS_FILMREEL",
    "GH_GOLDENSUN",
    "GOLDLEAF",
  ],
  accessories: [
    "MAPLE LEAF",
    "HOLLY",
    "BLUE FEATHERS",
    "CRIMSON",
    "TOAST",
    "RED FEATHERS",
  ],
  plantAccessories: ["MAPLE LEAF", "HOLLY"],
  wildAccessories: ["BLUE FEATHERS", "RED FEATHERS"],
  collarAccessories: ["CRIMSON"],
  extraAccessories: ["TOAST"],
  scars: ["ONE", "TWO", "THREE", "FOUR"],
};

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function cleanStarter() {
  const params: CatParams = {
    ...starterParams,
    isTortie: false,
    accessories: [],
    scars: [],
    tortie: [],
  };
  delete params.accessory;
  delete params.scar;
  delete params.tortieMask;
  delete params.tortiePattern;
  delete params.tortieColour;
  return params;
}

describe("evolution generation", () => {
  it("normalizes flat and wrapped starter payloads", () => {
    const flat = normalizeEvolutionStarter(starterParams);
    const wrapped = normalizeEvolutionStarter({
      params: starterParams,
      accessorySlots: ["MAPLE LEAF"],
      scarSlots: ["ONE"],
      tortieSlots: [{ mask: "ONE", pattern: "SingleColour", colour: "BLACK" }],
    });

    expect(flat.params.spriteNumber).toBe(7);
    expect(flat.accessorySlots).toEqual(["MAPLE LEAF"]);
    expect(flat.scarSlots).toEqual(["ONE"]);
    expect(flat.tortieSlots).toEqual([
      { mask: "ONE", pattern: "SingleColour", colour: "BLACK" },
    ]);
    expect(wrapped).toEqual(flat);
  });

  it("preserves starter params and existing layers while appending cumulatively", () => {
    const original = JSON.stringify(starterParams);
    const result = generateEvolutionBatch(
      { params: starterParams },
      {
        branchCount: 1,
        targetLevel: 3,
        torties: { min: 1, max: 1 },
        accessories: { min: 1, max: 1 },
        scars: { min: 1, max: 1 },
      },
      pools,
      { random: sequenceRandom([0.2, 0.4, 0.6, 0.8]) },
    );
    const levels = result.cats.filter((cat) => cat.level !== 0);

    expect(JSON.stringify(starterParams)).toBe(original);
    expect(levels).toHaveLength(3);
    levels.forEach((cat, index) => {
      expect(cat.catData.params.spriteNumber).toBe(starterParams.spriteNumber);
      expect(cat.catData.params.peltName).toBe(starterParams.peltName);
      expect(cat.catData.params.colour).toBe(starterParams.colour);
      expect(cat.catData.tortieSlots[0]).toEqual(starterParams.tortie?.[0]);
      expect(cat.catData.accessorySlots[0]).toBe("MAPLE LEAF");
      expect(cat.catData.scarSlots[0]).toBe("ONE");
      expect(cat.catData.tortieSlots).toHaveLength(index + 2);
      expect(cat.catData.accessorySlots).toHaveLength(index + 2);
      expect(cat.catData.scarSlots).toHaveLength(index + 2);
    });
  });

  it("respects branch count and target level", () => {
    const result = generateEvolutionBatch(
      { params: starterParams },
      { branchCount: 4, targetLevel: 2 },
      pools,
      { random: sequenceRandom([0.1, 0.3, 0.5, 0.7]) },
    );

    expect(result.controls.branchCount).toBe(4);
    expect(result.controls.targetLevel).toBe(2);
    expect(result.cats).toHaveLength(1 + 4 * 2);
    expect(result.cats.filter((cat) => cat.level === 2)).toHaveLength(4);
  });

  it("does not add scars when scars are disabled", () => {
    const result = generateEvolutionBatch(
      { params: starterParams },
      {
        branchCount: 2,
        targetLevel: 3,
        scarsEnabled: false,
        torties: { min: 0, max: 0 },
        accessories: { min: 0, max: 0 },
        scars: { min: 2, max: 2 },
      },
      pools,
      { random: sequenceRandom([0.2, 0.4, 0.6]) },
    );

    for (const cat of result.cats) {
      expect(cat.catData.scarSlots).toEqual(["ONE"]);
      expect(cat.additions.some((addition) => addition.kind === "scar")).toBe(
        false,
      );
    }
  });

  it("enforces per-step min and max limits", () => {
    const result = generateEvolutionBatch(
      { params: cleanStarter() },
      {
        branchCount: 1,
        targetLevel: 2,
        torties: { min: 2, max: 2 },
        accessories: { min: 0, max: 0 },
        scars: { min: 1, max: 1 },
      },
      pools,
      { random: sequenceRandom([0.25, 0.5, 0.75]) },
    );
    const levels = result.cats.filter((cat) => cat.level !== 0);

    expect(levels[0].catData.tortieSlots).toHaveLength(2);
    expect(levels[0].catData.accessorySlots).toHaveLength(0);
    expect(levels[0].catData.scarSlots).toHaveLength(1);
    expect(levels[1].catData.tortieSlots).toHaveLength(4);
    expect(levels[1].catData.accessorySlots).toHaveLength(0);
    expect(levels[1].catData.scarSlots).toHaveLength(2);
    for (const level of levels) {
      expect(level.rolls[0]).toMatchObject({
        kind: "tortie-count",
        value: 2,
        range: { min: 2, max: 2 },
      });
      expect(level.rolls.filter((roll) => roll.kind === "tortie-part")).toHaveLength(
        6,
      );
    }
  });

  it("creates each tortie layer from mask, pelt, and colour parts", () => {
    const result = generateEvolutionBatch(
      { params: cleanStarter() },
      {
        branchCount: 1,
        targetLevel: 1,
        torties: { min: 1, max: 1 },
        accessories: { min: 0, max: 0 },
        scars: { min: 0, max: 0 },
      },
      pools,
      { random: sequenceRandom([0.2, 0.4, 0.6]) },
    );
    const evolution = result.cats.find((cat) => cat.level === 1);
    const tortieAddition = evolution?.additions.find(
      (addition) => addition.kind === "tortie",
    );
    const layer = evolution?.catData.tortieSlots[0];

    expect(layer).toBeDefined();
    expect(layer?.mask).toBeTruthy();
    expect(layer?.pattern).toBeTruthy();
    expect(layer?.colour).toBeTruthy();
    expect(evolution?.catData.params.isTortie).toBe(true);
    expect(evolution?.catData.params.tortie).toEqual(evolution?.catData.tortieSlots);
    expect(evolution?.catData.params.tortieMask).toBe(layer?.mask);
    expect(evolution?.catData.params.tortiePattern).toBe(layer?.pattern);
    expect(evolution?.catData.params.tortieColour).toBe(layer?.colour);
    expect(tortieAddition).toMatchObject({
      kind: "tortie",
      value: layer,
      parts: getTortieLayerParts(layer),
    });
    expect(evolution?.rolls).toMatchObject([
      {
        kind: "tortie-count",
        label: "Tortie layers",
        value: 1,
        range: { min: 1, max: 1 },
      },
      { kind: "tortie-part", label: "Tortie 1 Mask", part: "mask" },
      { kind: "tortie-part", label: "Tortie 1 Pelt", part: "pattern" },
      { kind: "tortie-part", label: "Tortie 1 Colour", part: "colour" },
    ]);
  });

  it("avoids duplicate masks, scars, and accessories until pools are exhausted", () => {
    const result = generateEvolutionBatch(
      { params: cleanStarter() },
      {
        branchCount: 1,
        targetLevel: 3,
        torties: { min: 1, max: 1 },
        accessories: { min: 1, max: 1 },
        scars: { min: 1, max: 1 },
      },
      pools,
      { random: sequenceRandom([0.1, 0.1, 0.1]) },
    );
    const final = result.cats.find((cat) => cat.level === 3);
    const finalMasks = final?.catData.tortieSlots.map((layer) => layer?.mask) ?? [];
    const finalAccessories = final?.catData.accessorySlots ?? [];
    const finalScars = final?.catData.scarSlots ?? [];

    expect(final).toBeDefined();
    expect(new Set(finalMasks).size).toBe(3);
    expect(new Set(finalAccessories).size).toBe(3);
    expect(new Set(finalScars).size).toBe(3);
  });

  it("uses renderable evolution colours that are not near the starter colour", () => {
    const available = new Set([...pools.baseColours, ...pools.experimentalColours]);
    const result = generateEvolutionBatch(
      { params: cleanStarter() },
      {
        branchCount: 3,
        targetLevel: 1,
        torties: { min: 2, max: 2 },
        accessories: { min: 0, max: 0 },
        scars: { min: 0, max: 0 },
      },
      pools,
      { random: sequenceRandom([0.05, 0.35, 0.65, 0.95]) },
    );

    for (const cat of result.cats.filter((entry) => entry.level === 1)) {
      for (const layer of cat.catData.tortieSlots) {
        expect(layer?.colour).toBeTruthy();
        expect(available.has(layer?.colour ?? "")).toBe(true);
        expect(isNearStarterColour("GINGER", layer?.colour ?? "")).toBe(false);
      }
    }
  });

  it("can roll colours outside the archetype preferred subset", () => {
    const broadPools: EvolutionPools = {
      ...pools,
      baseColours: ["LILAC", "SILVER", "PALEGREY", "BROWN"],
      experimentalColours: [],
    };
    const result = generateEvolutionBatch(
      { params: cleanStarter() },
      {
        branchCount: 1,
        targetLevel: 1,
        torties: { min: 1, max: 1 },
        accessories: { min: 0, max: 0 },
        scars: { min: 0, max: 0 },
      },
      broadPools,
      { random: sequenceRandom([0, 0, 0, 0.9, 0.9, 0.99]) },
    );
    const evolution = result.cats.find((cat) => cat.level === 1);

    expect(evolution?.archetype).toBe("crystal");
    expect(evolution?.catData.tortieSlots[0]?.colour).toBe("BROWN");
  });
});
