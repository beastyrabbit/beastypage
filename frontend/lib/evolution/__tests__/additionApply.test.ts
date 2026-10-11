import { describe, expect, it } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  applyAdditions,
  applyAdditionsParams,
  COAT_ROLL_POSES,
  rollBaseParams,
  rollCandidates,
  rollParentFor,
  rollTraitLabel,
  rollValueLabel,
} from "../additionApply";
import {
  type EvolutionAddition,
  type EvolutionPools,
  LONG_HAIR_POSE,
  LONG_HAIR_SPRITE,
} from "../evolutionGenerator";
import { seededRandom } from "../rollSchedule";

const starterParams: CatParams = {
  spriteNumber: 8,
  poseName: "adult_short2",
  peltName: "SingleColour",
  coatPattern: "bengal-rosettes",
  colour: "GINGER",
  eyeColour: "GREEN",
  skinColour: "PINK",
  tint: "none",
  shading: true,
  reverse: false,
  isTortie: false,
  tortie: [],
  accessories: [],
  scars: [],
};

const pools: EvolutionPools = {
  tortieMasks: ["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "HALF"],
  tortiePatterns: ["SingleColour", "Tabby", "Marbled"],
  baseColours: ["WHITE", "SILVER", "BLACK", "GREY", "GOLDEN", "CREAM", "BROWN"],
  experimentalColours: ["AQUA", "TURQUOISE", "NEONGREEN", "NEONPINK"],
  accessories: [
    "MAPLE LEAF",
    "HOLLY",
    "BLUE BERRIES",
    "FORGET ME NOTS",
    "RYE STALK",
    "LAUREL",
    "BLUEBELLS",
    "NETTLE",
    "POPPY",
    "LAVENDER",
    "HERBS",
    "PETALS",
    "DRY HERBS",
    "OAK LEAVES",
  ],
  scars: [
    "ONE",
    "TWO",
    "THREE",
    "TAILSCAR",
    "SNOUT",
    "CHEEK",
    "SIDE",
    "THROAT",
  ],
};

const accessory: EvolutionAddition = {
  kind: "accessory",
  traitId: "accessories",
  label: "Accessory HOLLY",
  value: "HOLLY",
  traitValue: "HOLLY",
};
const scar: EvolutionAddition = {
  kind: "scar",
  traitId: "scars",
  label: "Scar SNOUT",
  value: "SNOUT",
  traitValue: "SNOUT",
};
const coat: EvolutionAddition = {
  kind: "coat",
  traitId: "pose",
  label: "Long coat",
  value: LONG_HAIR_POSE,
  traitValue: LONG_HAIR_POSE,
};
const tortie: EvolutionAddition = {
  kind: "tortie",
  traitId: "tortie",
  label: "Tortie ONE / Tabby / AQUA",
  value: { mask: "ONE", pattern: "Tabby", colour: "AQUA" },
  traitValue: { mask: "ONE", pattern: "Tabby", colour: "AQUA" },
  parts: [],
};

function withoutSlot(
  params: CatParams,
  slot: "accessories" | "scars" | "tortie",
) {
  const copy = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  const traits = (copy.traits ?? {}) as Record<string, unknown>;
  delete copy[slot];
  delete traits[slot];
  if (slot === "accessories") delete copy.accessory;
  if (slot === "scars") delete copy.scar;
  if (slot === "tortie") {
    delete copy.isTortie;
    delete copy.tortieMask;
    delete copy.tortiePattern;
    delete copy.tortieColour;
    delete copy.tortieCount;
  }
  return copy;
}

describe("applyAdditions", () => {
  it("adds an accessory to the slots and the params", () => {
    const data = applyAdditions({ params: starterParams }, [accessory]);
    expect(data.accessorySlots).toContain("HOLLY");
    expect(data.params.accessories).toContain("HOLLY");
    expect(data.evolution.role).toBe("branch");
    expect(data.evolution.additions).toEqual([accessory]);
  });

  it("a coat addition grows the long-hair pose", () => {
    const params = applyAdditionsParams({ params: starterParams }, [coat]);
    expect(params.poseName).toBe(LONG_HAIR_POSE);
    expect(params.spriteNumber).toBe(LONG_HAIR_SPRITE);
  });

  it("rollBaseParams(cats, 2, 1) is the parent plus additions[0]", () => {
    const cats = [
      { level: 0, catData: { params: starterParams }, additions: [] },
      {
        level: 1,
        catData: applyAdditions({ params: starterParams }, [accessory]),
        additions: [accessory],
      },
      {
        level: 2,
        catData: applyAdditions(
          applyAdditions({ params: starterParams }, [accessory]),
          [scar, tortie],
        ),
        additions: [scar, tortie],
      },
    ];
    expect(rollParentFor(cats, 1)).toBe(cats[0].catData);
    expect(rollParentFor(cats, 2)).toBe(cats[1].catData);
    expect(rollParentFor(cats, 7)).toBeNull();
    const base = rollBaseParams(cats, 2, 1);
    expect(base).not.toBeNull();
    expect(base?.scars).toContain("SNOUT");
    expect(base?.accessories).toContain("HOLLY");
    expect(base?.tortie ?? []).toHaveLength(0);
    expect(base).toEqual(applyAdditionsParams(cats[1].catData, [scar]));
  });
});

describe("rollCandidates", () => {
  const base = applyAdditionsParams({ params: starterParams }, []);

  it("returns `count` distinct accessory candidates, none the true value, only the slot differing", () => {
    const candidates = rollCandidates(
      base,
      accessory,
      pools,
      seededRandom(1),
      12,
    );
    expect(candidates).toHaveLength(12);
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const added = (candidate.accessories ?? []).filter(Boolean);
      expect(added).toHaveLength(1);
      expect(added[0]).not.toBe("HOLLY");
      seen.add(added[0] as string);
      expect(withoutSlot(candidate, "accessories")).toEqual(
        withoutSlot(base, "accessories"),
      );
    }
    expect(seen.size).toBe(12);
  });

  it("is deterministic for a given random", () => {
    expect(rollCandidates(base, scar, pools, seededRandom(5), 6)).toEqual(
      rollCandidates(base, scar, pools, seededRandom(5), 6),
    );
    expect(rollCandidates(base, scar, pools, seededRandom(5), 6)).not.toEqual(
      rollCandidates(base, scar, pools, seededRandom(6), 6),
    );
  });

  it("tortie candidates vary the tortie layer only and stay off the true layer", () => {
    const candidates = rollCandidates(base, tortie, pools, seededRandom(9), 8);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      const layers = (candidate.tortie ?? []).filter(Boolean);
      expect(layers).toHaveLength(1);
      expect(layers[0]).not.toEqual(tortie.value);
      expect(withoutSlot(candidate, "tortie")).toEqual(
        withoutSlot(base, "tortie"),
      );
    }
  });

  it("keeps tortie colours inside a controlled clan's palette", () => {
    const clanPools: EvolutionPools = {
      ...pools,
      clanColours: { flare: ["AQUA", "NEONPINK"] },
    };
    const allowed = new Set(["AQUA", "NEONPINK", ...pools.baseColours]);
    const candidates = rollCandidates(
      base,
      tortie,
      clanPools,
      seededRandom(2),
      12,
      "flare",
    );
    for (const candidate of candidates) {
      for (const layer of candidate.tortie ?? []) {
        expect(allowed.has((layer?.colour ?? "").toUpperCase())).toBe(true);
      }
    }
  });

  it("coat → up to 5 short poses, never the base pose or the long coat", () => {
    const candidates = rollCandidates(base, coat, pools, seededRandom(3));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);
    for (const candidate of candidates) {
      expect(candidate.poseName).not.toBe(base.poseName);
      expect(candidate.poseName).not.toBe(LONG_HAIR_POSE);
      expect(COAT_ROLL_POSES).toContain(candidate.poseName);
      expect(typeof candidate.spriteNumber).toBe("number");
    }
  });

  it("trait additions have no safe candidates", () => {
    const trait: EvolutionAddition = {
      kind: "trait",
      traitId: "eyeColour",
      label: "Eye colour",
      value: "BLUE",
      traitValue: "BLUE",
    };
    expect(rollCandidates(base, trait, pools, seededRandom(1))).toEqual([]);
  });
});

describe("labels", () => {
  it("names the trait for the plaque", () => {
    expect(rollTraitLabel(accessory)).toBe("ACCESSORY");
    expect(rollTraitLabel(scar)).toBe("SCAR");
    expect(rollTraitLabel(tortie)).toBe("TORTIE");
    expect(rollTraitLabel(coat)).toBe("COAT");
    expect(
      rollTraitLabel({
        kind: "replacement",
        traitId: "accessories",
        slot: "accessory",
        label: "x",
        previous: "HOLLY",
        value: "POPPY",
        previousValue: "HOLLY",
        traitValue: "POPPY",
      }),
    ).toBe("REPLACEMENT · ACCESSORY");
  });

  it("formats the full value word", () => {
    expect(rollValueLabel(accessory)).toBe("Holly");
    expect(rollValueLabel(tortie)).toBe("One / Tabby / Aqua");
  });
});
