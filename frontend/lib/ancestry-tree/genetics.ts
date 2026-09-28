import {
  applyCoatChoice,
  getCoatChoiceValue,
  isCoatPatternId,
} from "@/lib/cat-v3/coatPatterns";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import { pickOne } from "./nameGenerator";
import type {
  CatGenetics,
  Gender,
  GeneticTrait,
  TortieGenetics,
} from "./types";

const MUTATION_RATE = 0.05;
const MIN_TORTIE_LAYERS = 1;
const MAX_TORTIE_LAYERS = 4;

const DOMINANT_PELTS = new Set([
  "Tabby",
  "Mackerel",
  "Classic",
  "Ticked",
  "Spotted",
  "Rosette",
  "Sokoke",
  "Marbled",
  "Bengal",
  "Speckled",
  "Agouti",
]);

const RECESSIVE_PELTS = new Set(["SingleColour", "Single", "Solid"]);

const _CODOMINANT_WHITE_PATCHES = new Set([
  "FULLWHITE",
  "ANY",
  "TUXEDO",
  "LITTLE",
  "COLOURPOINT",
  "VAN",
  "ANYTWO",
  "MOON",
  "PHANTOM",
  "POWDER",
  "BLEACHED",
  "SAVANNAH",
  "FADESPOTS",
  "PEBBLESHINE",
  "EXTRA",
  "ONEEAR",
  "BROKEN",
  "LIGHTTUXEDO",
  "BUZZARDFANG",
  "RAGDOLL",
  "LIGHTSONG",
  "VITILIGO",
  "BLACKSTAR",
  "PIEBALD",
  "CURVED",
  "PETAL",
  "SHIBAINU",
  "OWL",
  "TIP",
  "FANCY",
  "FRECKLES",
  "RINGTAIL",
  "HALFFACE",
  "PANTSTWO",
  "GOATEE",
  "VITILIGO2",
  "PAWS",
  "MITAINE",
  "BROKENBLAZE",
  "SCOURGE",
  "DIVA",
  "BEARD",
  "TAIL",
  "BLAZE",
  "PRINCE",
  "BIB",
  "VEE",
  "UNDERS",
  "HONEY",
  "FAROFA",
  "DAMIEN",
  "MISTER",
  "BELLY",
  "TAILTIP",
  "TOES",
  "TOPCOVER",
  "APRON",
  "CAPSADDLE",
  "MASKMANTLE",
  "SQUEAKS",
  "STAR",
  "TOESTAIL",
  "RAVENPAW",
  "PANTS",
  "REVERSEPANTS",
  "SKUNK",
  "KARPATI",
  "HALFWHITE",
  "APPALOOSA",
  "DAPPLEPAW",
  "HEART",
  "LILTWO",
  "GLASS",
  "MOORISH",
  "SEPIAPOINT",
  "MINKPOINT",
  "SEALPOINT",
  "MAO",
  "LUNA",
  "CHESTSPECK",
  "WINGS",
  "PAINTED",
  "HEARTTWO",
  "WOODPECKER",
  "BOOTS",
  "MISS",
  "COW",
  "COWTWO",
  "BUB",
  "BOWTIE",
  "MUSTACHE",
  "REVERSEHEART",
  "SPARROW",
  "VEST",
  "LOVEBUG",
  "TRIXIE",
  "SAMMY",
  "SPARKLE",
  "RIGHTEAR",
  "LEFTEAR",
  "ESTRELLA",
  "SHOOTINGSTAR",
  "EYESPOT",
  "REVERSEEYE",
  "FADEBELLY",
  "FRONT",
  "BLOSSOMSTEP",
  "PEBBLE",
  "TAILTWO",
  "BUDDY",
  "BACKSPOT",
  "EYEBAGS",
  "BULLSEYE",
  "FINN",
  "DIGIT",
  "KROPKA",
  "FCTWO",
  "FCONE",
  "MIA",
  "SCAR",
  "BUSTER",
  "SMOKEY",
  "HAWKBLAZE",
  "CAKE",
  "ROSINA",
  "PRINCESS",
  "LOCKET",
  "BLAZEMASK",
  "TEARS",
  "DOUGIE",
]);

function roll(probability: number): boolean {
  return Math.random() < probability;
}

function createTrait<T>(allele1: T, allele2: T, expressed: T): GeneticTrait<T> {
  return { allele1, allele2, expressed };
}

function expressedPelt(allele1: string, allele2: string): string {
  // If one is dominant and one is recessive, dominant wins
  const a1Dominant = DOMINANT_PELTS.has(allele1) || isCoatPatternId(allele1);
  const a2Dominant = DOMINANT_PELTS.has(allele2) || isCoatPatternId(allele2);
  const a1Recessive = RECESSIVE_PELTS.has(allele1);
  const a2Recessive = RECESSIVE_PELTS.has(allele2);

  if (a1Dominant && a2Recessive) return allele1;
  if (a2Dominant && a1Recessive) return allele2;

  // If both dominant or both recessive, pick randomly
  return roll(0.5) ? allele1 : allele2;
}

function expressedWhitePatches(
  allele1: string | null,
  allele2: string | null,
): string | null {
  // White patches are codominant - can blend
  if (allele1 === null && allele2 === null) return null;
  if (allele1 === null) return allele2;
  if (allele2 === null) return allele1;

  // Both have patches - pick one randomly (codominance simplified)
  return roll(0.5) ? allele1 : allele2;
}

function expressedTortie(
  allele1: boolean,
  allele2: boolean,
  gender: Gender,
): boolean {
  // Tortie is sex-linked - primarily affects females
  // Males can be tortie but very rarely (~0.3%)
  if (gender === "M") {
    // Male tortie is extremely rare
    if (allele1 || allele2) {
      return roll(0.003); // 0.3% chance for males
    }
    return false;
  }

  // For females, if either allele is true, there's a good chance of tortie
  if (allele1 || allele2) {
    return roll(0.5);
  }
  return false;
}

function expressedSimple<T>(allele1: T, allele2: T): T {
  return roll(0.5) ? allele1 : allele2;
}

function pushIfMissing(values: string[], value: string | undefined): void {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

/**
 * Extract tortie genetics from cat params
 */
function extractTortieGenetics(params: CatParams): TortieGenetics | null {
  if (!params.isTortie || !params.tortie || params.tortie.length === 0) {
    return null;
  }

  const patterns: string[] = [];
  const masks: string[] = [];
  const colours: string[] = [];

  for (const layer of params.tortie) {
    if (!layer) continue;
    if (layer.pattern) patterns.push(layer.pattern);
    if (layer.mask) masks.push(layer.mask);
    if (layer.colour) colours.push(layer.colour);
  }

  // Also include legacy single-layer fields
  pushIfMissing(patterns, params.tortiePattern);
  pushIfMissing(masks, params.tortieMask);
  pushIfMissing(colours, params.tortieColour);

  return {
    hasTortieGene: true,
    patterns,
    masks,
    colours,
  };
}

/**
 * Inherit tortie data from parents, combining their tortie gene pools
 */
function inheritTortieData(
  motherData: TortieGenetics | null,
  fatherData: TortieGenetics | null,
  mutationPool: { pelts: string[]; colours: string[]; tortieMasks: string[] },
): TortieGenetics | null {
  const tortiePelts = mutationPool.pelts.filter(
    (pelt) => !isCoatPatternId(pelt),
  );

  // If neither parent has tortie genetics, rarely create new tortie genetics through mutation
  if (!motherData && !fatherData) {
    if (roll(MUTATION_RATE * 0.3)) {
      // Spontaneous tortie mutation - create fresh tortie genetics
      return {
        hasTortieGene: true,
        patterns: tortiePelts.length > 0 ? [pickOne(tortiePelts)] : ["Tabby"],
        masks:
          mutationPool.tortieMasks.length > 0
            ? [pickOne(mutationPool.tortieMasks)]
            : ["ONE"],
        colours:
          mutationPool.colours.length > 0
            ? [pickOne(mutationPool.colours)]
            : ["BLACK"],
      };
    }
    return null;
  }

  // Combine genetics from both parents
  const combinedPatterns = new Set<string>();
  const combinedMasks = new Set<string>();
  const combinedColours = new Set<string>();

  if (motherData) {
    motherData.patterns.forEach((p) => {
      combinedPatterns.add(p);
    });
    motherData.masks.forEach((m) => {
      combinedMasks.add(m);
    });
    motherData.colours.forEach((c) => {
      combinedColours.add(c);
    });
  }

  if (fatherData) {
    fatherData.patterns.forEach((p) => {
      combinedPatterns.add(p);
    });
    fatherData.masks.forEach((m) => {
      combinedMasks.add(m);
    });
    fatherData.colours.forEach((c) => {
      combinedColours.add(c);
    });
  }

  // Apply mutations - chance to add new patterns/masks/colours
  if (roll(MUTATION_RATE) && tortiePelts.length > 0) {
    combinedPatterns.add(pickOne(tortiePelts));
  }
  if (roll(MUTATION_RATE) && mutationPool.tortieMasks.length > 0) {
    combinedMasks.add(pickOne(mutationPool.tortieMasks));
  }
  if (roll(MUTATION_RATE) && mutationPool.colours.length > 0) {
    combinedColours.add(pickOne(mutationPool.colours));
  }

  return {
    hasTortieGene: true,
    patterns: Array.from(combinedPatterns),
    masks: Array.from(combinedMasks),
    colours: Array.from(combinedColours),
  };
}

/**
 * Pick an inherited value, or (on mutation / empty inheritance) a pool value,
 * falling back to a default when the pool is empty.
 */
function inheritOrMutate(
  inherited: string[],
  pool: string[],
  fallback: string,
): string {
  if (inherited.length > 0 && !roll(MUTATION_RATE)) {
    return pickOne(inherited);
  }
  if (pool.length > 0) {
    return pickOne(pool);
  }
  return fallback;
}

/**
 * Mask - inherit or mutate (try to use unique masks)
 */
function pickLayerMask(
  inherited: string[],
  pool: string[],
  usedMasks: Set<string>,
): string {
  const availableMasks = inherited.filter((m) => !usedMasks.has(m));
  if (availableMasks.length > 0 && !roll(MUTATION_RATE)) {
    return pickOne(availableMasks);
  }
  if (pool.length > 0) {
    const poolMasks = pool.filter((m) => !usedMasks.has(m));
    return poolMasks.length > 0 ? pickOne(poolMasks) : pickOne(pool);
  }
  return "ONE";
}

/**
 * Generate tortie layers from inherited genetics
 * Returns 1-4 layers randomly, using inherited patterns/masks/colours
 */
export function generateTortieLayers(
  tortieData: TortieGenetics,
  mutationPool: { pelts: string[]; colours: string[]; tortieMasks: string[] },
): TortieLayer[] {
  const tortiePelts = mutationPool.pelts.filter(
    (pelt) => !isCoatPatternId(pelt),
  );
  const numLayers =
    MIN_TORTIE_LAYERS +
    Math.floor(Math.random() * (MAX_TORTIE_LAYERS - MIN_TORTIE_LAYERS + 1));
  const layers: TortieLayer[] = [];
  const usedMasks = new Set<string>();

  for (let i = 0; i < numLayers; i++) {
    // Pick from inherited or mutate
    const pattern = inheritOrMutate(tortieData.patterns, tortiePelts, "Tabby");
    const mask = pickLayerMask(
      tortieData.masks,
      mutationPool.tortieMasks,
      usedMasks,
    );
    usedMasks.add(mask);
    const colour = inheritOrMutate(
      tortieData.colours,
      mutationPool.colours,
      "BLACK",
    );

    layers.push({ pattern, mask, colour });
  }

  return layers;
}

export function createGeneticsFromParams(
  params: CatParams,
  _gender: Gender,
): CatGenetics {
  const tortieData = extractTortieGenetics(params);
  const coatChoice = getCoatChoiceValue(params);

  return {
    pelt: createTrait(coatChoice, coatChoice, coatChoice),
    colour: createTrait(params.colour, params.colour, params.colour),
    eyeColour: createTrait(
      params.eyeColour,
      params.eyeColour,
      params.eyeColour,
    ),
    skinColour: createTrait(
      params.skinColour,
      params.skinColour,
      params.skinColour,
    ),
    whitePatches: createTrait(
      params.whitePatches ?? null,
      params.whitePatches ?? null,
      params.whitePatches ?? null,
    ),
    isTortie: createTrait(
      params.isTortie ?? false,
      params.isTortie ?? false,
      params.isTortie ?? false,
    ),
    tortieData: createTrait(tortieData, tortieData, tortieData),
  };
}

function mutateWhitePatches(pool: string[]): string | null {
  return roll(0.5) ? pickOne(pool) : null;
}

/**
 * Pass one of a parent's two alleles to the child at random
 */
function passAllele<T>(trait: GeneticTrait<T>): T {
  return roll(0.5) ? trait.allele1 : trait.allele2;
}

/**
 * Keep the inherited allele, or (on mutation) swap in a pool value
 */
function mutateAllele(inherited: string, pool: string[]): string {
  return roll(MUTATION_RATE) && pool.length > 0 ? pickOne(pool) : inherited;
}

function mutateWhiteAllele(
  inherited: string | null,
  pool: string[],
): string | null {
  return roll(MUTATION_RATE) && pool.length > 0
    ? mutateWhitePatches(pool)
    : inherited;
}

function mutateTortieAllele(inherited: boolean): boolean {
  return roll(MUTATION_RATE * 0.5) ? !inherited : inherited;
}

/**
 * Fresh tortie genetics for a tortie child without inherited tortie data
 */
function createFreshTortieData(mutationPool: {
  pelts: string[];
  colours: string[];
  tortieMasks?: string[];
}): TortieGenetics {
  const tortiePelts = mutationPool.pelts.filter(
    (pelt) => !isCoatPatternId(pelt),
  );
  return {
    hasTortieGene: true,
    patterns: tortiePelts.length > 0 ? [pickOne(tortiePelts)] : ["Tabby"],
    masks: mutationPool.tortieMasks?.length
      ? [pickOne(mutationPool.tortieMasks)]
      : ["ONE"],
    colours:
      mutationPool.colours.length > 0
        ? [pickOne(mutationPool.colours)]
        : ["BLACK"],
  };
}

export function inheritGenetics(
  motherGenetics: CatGenetics,
  fatherGenetics: CatGenetics,
  childGender: Gender,
  mutationPool: {
    pelts: string[];
    colours: string[];
    eyeColours: string[];
    skinColours: string[];
    whitePatches: string[];
    tortieMasks?: string[];
  },
): CatGenetics {
  // Each parent passes one random allele to the child
  const motherPelt = passAllele(motherGenetics.pelt);
  const fatherPelt = passAllele(fatherGenetics.pelt);

  const motherColour = passAllele(motherGenetics.colour);
  const fatherColour = passAllele(fatherGenetics.colour);

  const motherEye = passAllele(motherGenetics.eyeColour);
  const fatherEye = passAllele(fatherGenetics.eyeColour);

  const motherSkin = passAllele(motherGenetics.skinColour);
  const fatherSkin = passAllele(fatherGenetics.skinColour);

  const motherWhite = passAllele(motherGenetics.whitePatches);
  const fatherWhite = passAllele(fatherGenetics.whitePatches);

  const motherTortie = passAllele(motherGenetics.isTortie);
  const fatherTortie = passAllele(fatherGenetics.isTortie);

  // Tortie data inheritance
  const motherTortieData = roll(0.5)
    ? motherGenetics.tortieData?.allele1
    : motherGenetics.tortieData?.allele2;
  const fatherTortieData = roll(0.5)
    ? fatherGenetics.tortieData?.allele1
    : fatherGenetics.tortieData?.allele2;

  // Apply mutations
  const childPeltA1 = mutateAllele(motherPelt, mutationPool.pelts);
  const childPeltA2 = mutateAllele(fatherPelt, mutationPool.pelts);

  const childColourA1 = mutateAllele(motherColour, mutationPool.colours);
  const childColourA2 = mutateAllele(fatherColour, mutationPool.colours);

  const childEyeA1 = mutateAllele(motherEye, mutationPool.eyeColours);
  const childEyeA2 = mutateAllele(fatherEye, mutationPool.eyeColours);

  const childSkinA1 = mutateAllele(motherSkin, mutationPool.skinColours);
  const childSkinA2 = mutateAllele(fatherSkin, mutationPool.skinColours);

  const childWhiteA1 = mutateWhiteAllele(
    motherWhite,
    mutationPool.whitePatches,
  );
  const childWhiteA2 = mutateWhiteAllele(
    fatherWhite,
    mutationPool.whitePatches,
  );

  // Tortie gene mutation is rare
  const childTortieA1 = mutateTortieAllele(motherTortie);
  const childTortieA2 = mutateTortieAllele(fatherTortie);

  // Inherit tortie layer data (patterns, masks, colours)
  const childTortieData = inheritTortieData(
    motherTortieData ?? null,
    fatherTortieData ?? null,
    {
      pelts: mutationPool.pelts,
      colours: mutationPool.colours,
      tortieMasks: mutationPool.tortieMasks ?? [],
    },
  );

  // Determine if child expresses tortie
  const childIsTortie = expressedTortie(
    childTortieA1,
    childTortieA2,
    childGender,
  );

  // If child is tortie but has no inherited tortie data, create some
  let expressedTortieData = childTortieData;
  if (childIsTortie && !expressedTortieData) {
    expressedTortieData = createFreshTortieData(mutationPool);
  }

  return {
    pelt: createTrait(
      childPeltA1,
      childPeltA2,
      expressedPelt(childPeltA1, childPeltA2),
    ),
    colour: createTrait(
      childColourA1,
      childColourA2,
      expressedSimple(childColourA1, childColourA2),
    ),
    eyeColour: createTrait(
      childEyeA1,
      childEyeA2,
      expressedSimple(childEyeA1, childEyeA2),
    ),
    skinColour: createTrait(
      childSkinA1,
      childSkinA2,
      expressedSimple(childSkinA1, childSkinA2),
    ),
    whitePatches: createTrait(
      childWhiteA1,
      childWhiteA2,
      expressedWhitePatches(childWhiteA1, childWhiteA2),
    ),
    isTortie: createTrait(childTortieA1, childTortieA2, childIsTortie),
    tortieData: createTrait(
      childTortieData,
      childTortieData,
      expressedTortieData,
    ),
  };
}

export function geneticsToParams(
  genetics: CatGenetics,
  baseParams: Partial<CatParams>,
  mutationPool?: { pelts: string[]; colours: string[]; tortieMasks: string[] },
): CatParams {
  // Spread baseParams first, then override with genetics-derived values
  // This ensures genetics takes precedence over baseParams for trait fields
  const {
    peltName: _,
    coatPattern: _coatPattern,
    colour: _c,
    eyeColour: _e,
    skinColour: _s,
    whitePatches: _w,
    isTortie: _t,
    tortie: _tortie,
    tortieMask: _tm,
    tortieColour: _tc,
    tortiePattern: _tp,
    ...allowedOverrides
  } = baseParams;

  const result: CatParams = {
    spriteNumber: baseParams.spriteNumber ?? 0,
    shading: baseParams.shading ?? true,
    reverse: baseParams.reverse ?? false,
    ...allowedOverrides,
    // Genetics-derived values take precedence
    peltName: "SingleColour",
    colour: genetics.colour.expressed,
    eyeColour: genetics.eyeColour.expressed,
    skinColour: genetics.skinColour.expressed,
    whitePatches: genetics.whitePatches.expressed ?? undefined,
    isTortie: genetics.isTortie.expressed,
  };

  applyCoatChoice(result, genetics.pelt.expressed);

  // Generate tortie layers if cat is tortie
  if (genetics.isTortie.expressed && genetics.tortieData?.expressed) {
    const pool = mutationPool ?? { pelts: [], colours: [], tortieMasks: [] };
    const layers = generateTortieLayers(genetics.tortieData.expressed, pool);

    if (layers.length > 0) {
      result.tortie = layers;
      result.tortieMask = layers[0].mask;
      result.tortieColour = layers[0].colour;
      result.tortiePattern = layers[0].pattern;
    }
  }

  return result;
}
