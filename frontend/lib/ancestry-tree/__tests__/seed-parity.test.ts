import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { Xoshiro128StarStar } from "@/lib/cat-system/gacha/rng";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  createGeneticsFromParams,
  geneticsToParams,
  inheritGenetics,
} from "../genetics";
import { AncestryTreeManager, type MutationPool } from "../treeManager";

const mother: CatParams = {
  spriteNumber: 0,
  peltName: "Tabby",
  colour: "GINGER",
  eyeColour: "GREEN",
  skinColour: "PINK",
  shading: true,
  reverse: false,
  isTortie: true,
  tortie: [{ pattern: "Tabby", mask: "ONE", colour: "BLACK" }],
  tortiePattern: "SingleColour",
  tortieMask: "TWO",
  tortieColour: "WHITE",
};
const father: CatParams = {
  ...mother,
  peltName: "SingleColour",
  colour: "BLACK",
  isTortie: false,
  tortie: [],
};
const pool: MutationPool = {
  pelts: ["Tabby", "SingleColour", "bengal-rosettes"],
  colours: ["BLACK", "GINGER", "WHITE"],
  eyeColours: ["GREEN", "BLUE"],
  skinColours: ["PINK", "BLACK"],
  whitePatches: ["TUXEDO"],
  tortieMasks: ["ONE", "TWO"],
  spriteNumbers: [0, 1, 2],
  accessories: [],
  scars: [],
  traits: {},
};
const emptyPool: MutationPool = {
  pelts: [],
  colours: [],
  eyeColours: [],
  skinColours: [],
  whitePatches: [],
  tortieMasks: [],
  spriteNumbers: [],
  accessories: [],
  scars: [],
  traits: {},
};
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

afterEach(() => vi.restoreAllMocks());

it("preserves pre-refactor genetics, tortie layers and RNG consumption across seeds", () => {
  const observed = [];
  for (let seed = 0; seed < 128; seed++) {
    const random = new Xoshiro128StarStar(seed);
    vi.spyOn(Math, "random").mockImplementation(() => random.nextFloat());
    for (const mutationPool of [pool, emptyPool]) {
      for (const parents of [
        [mother, father],
        [mother, mother],
        [father, father],
      ]) {
        const genetics = inheritGenetics(
          createGeneticsFromParams(parents[0], "F"),
          createGeneticsFromParams(parents[1], "M"),
          seed % 2 ? "M" : "F",
          mutationPool,
        );
        observed.push({
          genetics,
          params: geneticsToParams(genetics, {}, mutationPool),
          next: random.nextUint32(),
        });
      }
    }
  }
  expect(fingerprint(observed)).toMatchInlineSnapshot(
    `"76121585635021addbb320d3982266836365c407f08fad104e65f3ba7c4e38d5"`,
  );
});

it("preserves pre-refactor trees, partner selection, names and RNG consumption", () => {
  vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => array);
  let id = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  );
  const observed = [];
  for (const mutationPool of [pool, emptyPool]) {
    for (let seed = 0; seed < 16; seed++) {
      const random = new Xoshiro128StarStar(seed);
      vi.spyOn(Math, "random").mockImplementation(() => random.nextFloat());
      const manager = new AncestryTreeManager(mutationPool);
      manager.setConfig({
        minChildren: 2,
        maxChildren: 3,
        depth: 3,
        partnerChance: seed % 3 === 0 ? 0 : 1,
      });
      manager.initializeFoundingCouple({
        mother: { params: mother, historyProfileId: "mother-history" },
        father: { params: father },
      });
      manager.prepareForFullTree();
      const counts: number[] = [];
      let failure: string | undefined;
      try {
        for (const generation of [1, 2, 3])
          counts.push(manager.generateGeneration(generation));
      } catch (error) {
        // Empty/small mutation pools can already produce duplicate tortie layers.
        // Freeze that existing failure and the partially generated tree as well.
        failure = error instanceof Error ? error.message : String(error);
      }
      observed.push({
        counts,
        failure,
        tree: manager.serialize(),
        next: random.nextUint32(),
      });
    }
  }
  expect(fingerprint(observed)).toMatchInlineSnapshot(
    `"53b327e70fcad0aa95b583e005aad0b8fd822bdd3ddf230f1abc6023e9b43640"`,
  );
});

it("preserves seeded manual partner assignment and replacement", () => {
  vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => array);
  let id = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  );
  const observed = [];
  for (let seed = 0; seed < 32; seed++) {
    const random = new Xoshiro128StarStar(seed);
    vi.spyOn(Math, "random").mockImplementation(() => random.nextFloat());
    const manager = new AncestryTreeManager(pool);
    const founders = manager.initializeFoundingCouple({
      mother: { params: father },
      father: { params: father },
    });
    const cat = seed % 2 ? founders.mother : founders.father;
    cat.lifeStage = "elder";
    const assigned = manager.assignPartner(cat.id, father);
    expect(assigned.lifeStage).toBe("elder");
    expect(cat.partnerIds).toContain(assigned.id);
    observed.push(fingerprint(manager.serialize()));
    const replacement = manager.replacePartner(cat.id, father, {
      prefix: "Ash",
      suffix: "fern",
      full: "Ashfern",
    });
    expect(replacement.name.full).toBe("Ashfern");
    expect(replacement.lifeStage).toBe("elder");
    expect(assigned.partnerIds).not.toContain(cat.id);
    expect(cat.partnerIds).toEqual([replacement.id]);
    observed.push({
      tree: fingerprint(manager.serialize()),
      next: random.nextUint32(),
    });
  }
  expect(fingerprint(observed)).toMatchInlineSnapshot(
    `"1e0206375fc345f406f2d585558cf65a6be7833e67c386170856b59be62c4f00"`,
  );
});
