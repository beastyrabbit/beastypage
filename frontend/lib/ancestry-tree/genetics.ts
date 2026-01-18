import type { CatParams, TortieLayer } from '@/lib/cat-v3/types';
import type { CatGenetics, GeneticTrait, Gender, TortieGenetics } from './types';
import { pickOne } from './nameGenerator';

const MUTATION_RATE = 0.05;
const MIN_TORTIE_LAYERS = 1;
const MAX_TORTIE_LAYERS = 4;

const DOMINANT_PELTS = new Set([
  'Tabby', 'Mackerel', 'Classic', 'Ticked', 'Spotted', 'Rosette', 'Sokoke',
  'Marbled', 'Bengal', 'Speckled', 'Agouti',
]);

const RECESSIVE_PELTS = new Set([
  'SingleColour', 'Single', 'Solid',
]);

const CODOMINANT_WHITE_PATCHES = new Set([
  'FULLWHITE', 'ANY', 'TUXEDO', 'LITTLE', 'COLOURPOINT', 'VAN', 'ANYTWO',
  'MOON', 'PHANTOM', 'POWDER', 'BLEACHED', 'SAVANNAH', 'FADESPOTS',
  'PEBBLESHINE', 'EXTRA', 'ONEEAR', 'BROKEN', 'LIGHTTUXEDO', 'BUZZARDFANG',
  'RAGDOLL', 'LIGHTSONG', 'VITILIGO', 'BLACKSTAR', 'PIEBALD', 'CURVED',
  'PETAL', 'SHIBAINU', 'OWL', 'TIP', 'FANCY', 'FRECKLES', 'RINGTAIL',
  'HALFFACE', 'PANTSTWO', 'GOATEE', 'VITILIGO2', 'PAWS', 'MITAINE',
  'BROKENBLAZE', 'SCOURGE', 'DIVA', 'BEARD', 'TAIL', 'BLAZE', 'PRINCE',
  'BIB', 'VEE', 'UNDERS', 'HONEY', 'FAROFA', 'DAMIEN', 'MISTER', 'BELLY',
  'TAILTIP', 'TOES', 'TOPCOVER', 'APRON', 'CAPSADDLE', 'MASKMANTLE',
  'SQUEAKS', 'STAR', 'TOESTAIL', 'RAVENPAW', 'PANTS', 'REVERSEPANTS',
  'SKUNK', 'KARPATI', 'HALFWHITE', 'APPALOOSA', 'DAPPLEPAW', 'HEART',
  'LILTWO', 'GLASS', 'MOORISH', 'SEPIAPOINT', 'MINKPOINT', 'SEALPOINT',
  'MAO', 'LUNA', 'CHESTSPECK', 'WINGS', 'PAINTED', 'HEARTTWO', 'WOODPECKER',
  'BOOTS', 'MISS', 'COW', 'COWTWO', 'BUB', 'BOWTIE', 'MUSTACHE', 'REVERSEHEART',
  'SPARROW', 'VEST', 'LOVEBUG', 'TRIXIE', 'SAMMY', 'SPARKLE', 'RIGHTEAR',
  'LEFTEAR', 'ESTRELLA', 'SHOOTINGSTAR', 'EYESPOT', 'REVERSEEYE', 'FADEBELLY',
  'FRONT', 'BLOSSOMSTEP', 'PEBBLE', 'TAILTWO', 'BUDDY', 'BACKSPOT', 'EYEBAGS',
  'BULLSEYE', 'FINN', 'DIGIT', 'KROPKA', 'FCTWO', 'FCONE', 'MIA', 'SCAR',
  'BUSTER', 'SMOKEY', 'HAWKBLAZE', 'CAKE', 'ROSINA', 'PRINCESS', 'LOCKET',
  'BLAZEMASK', 'TEARS', 'DOUGIE',
]);

function roll(probability: number): boolean {
  return Math.random() < probability;
}

function createTrait<T>(allele1: T, allele2: T, expressed: T): GeneticTrait<T> {
  return { allele1, allele2, expressed };
}

function expressedPelt(allele1: string, allele2: string): string {
  // If one is dominant and one is recessive, dominant wins
  const a1Dominant = DOMINANT_PELTS.has(allele1);
  const a2Dominant = DOMINANT_PELTS.has(allele2);
  const a1Recessive = RECESSIVE_PELTS.has(allele1);
  const a2Recessive = RECESSIVE_PELTS.has(allele2);

  if (a1Dominant && a2Recessive) return allele1;
  if (a2Dominant && a1Recessive) return allele2;

  // If both dominant or both recessive, pick randomly
  return roll(0.5) ? allele1 : allele2;
}

function expressedWhitePatches(allele1: string | null, allele2: string | null): string | null {
  // White patches are codominant - can blend
  if (allele1 === null && allele2 === null) return null;
  if (allele1 === null) return allele2;
  if (allele2 === null) return allele1;

  // Both have patches - pick one randomly (codominance simplified)
  return roll(0.5) ? allele1 : allele2;
}

function expressedTortie(allele1: boolean, allele2: boolean, gender: Gender): boolean {
  // Tortie is sex-linked - primarily affects females
  // Males can be tortie but very rarely (~0.3%)
  if (gender === 'M') {
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
    if (layer) {
      if (layer.pattern) patterns.push(layer.pattern);
      if (layer.mask) masks.push(layer.mask);
      if (layer.colour) colours.push(layer.colour);
    }
  }

  // Also include legacy single-layer fields
  if (params.tortiePattern && !patterns.includes(params.tortiePattern)) {
    patterns.push(params.tortiePattern);
  }
  if (params.tortieMask && !masks.includes(params.tortieMask)) {
    masks.push(params.tortieMask);
  }
  if (params.tortieColour && !colours.includes(params.tortieColour)) {
    colours.push(params.tortieColour);
  }

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
  mutationPool: { pelts: string[]; colours: string[]; tortieMasks: string[] }
): TortieGenetics | null {
  // If neither parent has tortie genetics, rarely create new tortie genetics through mutation
  if (!motherData && !fatherData) {
    if (roll(MUTATION_RATE * 0.3)) {
      // Spontaneous tortie mutation - create fresh tortie genetics
      return {
        hasTortieGene: true,
        patterns: mutationPool.pelts.length > 0 ? [pickOne(mutationPool.pelts)] : ['Tabby'],
        masks: mutationPool.tortieMasks.length > 0 ? [pickOne(mutationPool.tortieMasks)] : ['ONE'],
        colours: mutationPool.colours.length > 0 ? [pickOne(mutationPool.colours)] : ['BLACK'],
      };
    }
    return null;
  }

  // Combine genetics from both parents
  const combinedPatterns = new Set<string>();
  const combinedMasks = new Set<string>();
  const combinedColours = new Set<string>();

  if (motherData) {
    motherData.patterns.forEach(p => combinedPatterns.add(p));
    motherData.masks.forEach(m => combinedMasks.add(m));
    motherData.colours.forEach(c => combinedColours.add(c));
  }

  if (fatherData) {
    fatherData.patterns.forEach(p => combinedPatterns.add(p));
    fatherData.masks.forEach(m => combinedMasks.add(m));
    fatherData.colours.forEach(c => combinedColours.add(c));
  }

  // Apply mutations - chance to add new patterns/masks/colours
  if (roll(MUTATION_RATE) && mutationPool.pelts.length > 0) {
    combinedPatterns.add(pickOne(mutationPool.pelts));
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
 * Generate tortie layers from inherited genetics
 * Returns 1-4 layers randomly, using inherited patterns/masks/colours
 */
export function generateTortieLayers(
  tortieData: TortieGenetics,
  mutationPool: { pelts: string[]; colours: string[]; tortieMasks: string[] }
): TortieLayer[] {
  const numLayers = MIN_TORTIE_LAYERS + Math.floor(Math.random() * (MAX_TORTIE_LAYERS - MIN_TORTIE_LAYERS + 1));
  const layers: TortieLayer[] = [];
  const usedMasks = new Set<string>();

  for (let i = 0; i < numLayers; i++) {
    // Pick from inherited or mutate
    let pattern: string;
    let mask: string;
    let colour: string;

    // Pattern - inherit or mutate
    if (tortieData.patterns.length > 0 && !roll(MUTATION_RATE)) {
      pattern = pickOne(tortieData.patterns);
    } else if (mutationPool.pelts.length > 0) {
      pattern = pickOne(mutationPool.pelts);
    } else {
      pattern = 'Tabby';
    }

    // Mask - inherit or mutate (try to use unique masks)
    const availableMasks = tortieData.masks.filter(m => !usedMasks.has(m));
    if (availableMasks.length > 0 && !roll(MUTATION_RATE)) {
      mask = pickOne(availableMasks);
    } else if (mutationPool.tortieMasks.length > 0) {
      const poolMasks = mutationPool.tortieMasks.filter(m => !usedMasks.has(m));
      mask = poolMasks.length > 0 ? pickOne(poolMasks) : pickOne(mutationPool.tortieMasks);
    } else {
      mask = 'ONE';
    }
    usedMasks.add(mask);

    // Colour - inherit or mutate
    if (tortieData.colours.length > 0 && !roll(MUTATION_RATE)) {
      colour = pickOne(tortieData.colours);
    } else if (mutationPool.colours.length > 0) {
      colour = pickOne(mutationPool.colours);
    } else {
      colour = 'BLACK';
    }

    layers.push({ pattern, mask, colour });
  }

  return layers;
}

export function createGeneticsFromParams(params: CatParams, gender: Gender): CatGenetics {
  const tortieData = extractTortieGenetics(params);

  return {
    pelt: createTrait(params.peltName, params.peltName, params.peltName),
    colour: createTrait(params.colour, params.colour, params.colour),
    eyeColour: createTrait(params.eyeColour, params.eyeColour, params.eyeColour),
    skinColour: createTrait(params.skinColour, params.skinColour, params.skinColour),
    whitePatches: createTrait(
      params.whitePatches ?? null,
      params.whitePatches ?? null,
      params.whitePatches ?? null
    ),
    isTortie: createTrait(params.isTortie ?? false, params.isTortie ?? false, params.isTortie ?? false),
    tortieData: createTrait(tortieData, tortieData, tortieData),
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
  }
): CatGenetics {
  // Each parent passes one random allele to the child
  const motherPelt = roll(0.5) ? motherGenetics.pelt.allele1 : motherGenetics.pelt.allele2;
  const fatherPelt = roll(0.5) ? fatherGenetics.pelt.allele1 : fatherGenetics.pelt.allele2;

  const motherColour = roll(0.5) ? motherGenetics.colour.allele1 : motherGenetics.colour.allele2;
  const fatherColour = roll(0.5) ? fatherGenetics.colour.allele1 : fatherGenetics.colour.allele2;

  const motherEye = roll(0.5) ? motherGenetics.eyeColour.allele1 : motherGenetics.eyeColour.allele2;
  const fatherEye = roll(0.5) ? fatherGenetics.eyeColour.allele1 : fatherGenetics.eyeColour.allele2;

  const motherSkin = roll(0.5) ? motherGenetics.skinColour.allele1 : motherGenetics.skinColour.allele2;
  const fatherSkin = roll(0.5) ? fatherGenetics.skinColour.allele1 : fatherGenetics.skinColour.allele2;

  const motherWhite = roll(0.5) ? motherGenetics.whitePatches.allele1 : motherGenetics.whitePatches.allele2;
  const fatherWhite = roll(0.5) ? fatherGenetics.whitePatches.allele1 : fatherGenetics.whitePatches.allele2;

  const motherTortie = roll(0.5) ? motherGenetics.isTortie.allele1 : motherGenetics.isTortie.allele2;
  const fatherTortie = roll(0.5) ? fatherGenetics.isTortie.allele1 : fatherGenetics.isTortie.allele2;

  // Tortie data inheritance
  const motherTortieData = roll(0.5)
    ? motherGenetics.tortieData?.allele1
    : motherGenetics.tortieData?.allele2;
  const fatherTortieData = roll(0.5)
    ? fatherGenetics.tortieData?.allele1
    : fatherGenetics.tortieData?.allele2;

  // Apply mutations
  const childPeltA1 = roll(MUTATION_RATE) && mutationPool.pelts.length > 0
    ? pickOne(mutationPool.pelts)
    : motherPelt;
  const childPeltA2 = roll(MUTATION_RATE) && mutationPool.pelts.length > 0
    ? pickOne(mutationPool.pelts)
    : fatherPelt;

  const childColourA1 = roll(MUTATION_RATE) && mutationPool.colours.length > 0
    ? pickOne(mutationPool.colours)
    : motherColour;
  const childColourA2 = roll(MUTATION_RATE) && mutationPool.colours.length > 0
    ? pickOne(mutationPool.colours)
    : fatherColour;

  const childEyeA1 = roll(MUTATION_RATE) && mutationPool.eyeColours.length > 0
    ? pickOne(mutationPool.eyeColours)
    : motherEye;
  const childEyeA2 = roll(MUTATION_RATE) && mutationPool.eyeColours.length > 0
    ? pickOne(mutationPool.eyeColours)
    : fatherEye;

  const childSkinA1 = roll(MUTATION_RATE) && mutationPool.skinColours.length > 0
    ? pickOne(mutationPool.skinColours)
    : motherSkin;
  const childSkinA2 = roll(MUTATION_RATE) && mutationPool.skinColours.length > 0
    ? pickOne(mutationPool.skinColours)
    : fatherSkin;

  const childWhiteA1 = roll(MUTATION_RATE) && mutationPool.whitePatches.length > 0
    ? (roll(0.5) ? pickOne(mutationPool.whitePatches) : null)
    : motherWhite;
  const childWhiteA2 = roll(MUTATION_RATE) && mutationPool.whitePatches.length > 0
    ? (roll(0.5) ? pickOne(mutationPool.whitePatches) : null)
    : fatherWhite;

  // Tortie gene mutation is rare
  const childTortieA1 = roll(MUTATION_RATE * 0.5) ? !motherTortie : motherTortie;
  const childTortieA2 = roll(MUTATION_RATE * 0.5) ? !fatherTortie : fatherTortie;

  // Inherit tortie layer data (patterns, masks, colours)
  const childTortieData = inheritTortieData(
    motherTortieData ?? null,
    fatherTortieData ?? null,
    { pelts: mutationPool.pelts, colours: mutationPool.colours, tortieMasks: mutationPool.tortieMasks ?? [] }
  );

  // Determine if child expresses tortie
  const childIsTortie = expressedTortie(childTortieA1, childTortieA2, childGender);

  // If child is tortie but has no inherited tortie data, create some
  let expressedTortieData = childTortieData;
  if (childIsTortie && !expressedTortieData) {
    expressedTortieData = {
      hasTortieGene: true,
      patterns: mutationPool.pelts.length > 0 ? [pickOne(mutationPool.pelts)] : ['Tabby'],
      masks: mutationPool.tortieMasks?.length ? [pickOne(mutationPool.tortieMasks)] : ['ONE'],
      colours: mutationPool.colours.length > 0 ? [pickOne(mutationPool.colours)] : ['BLACK'],
    };
  }

  return {
    pelt: createTrait(childPeltA1, childPeltA2, expressedPelt(childPeltA1, childPeltA2)),
    colour: createTrait(childColourA1, childColourA2, expressedSimple(childColourA1, childColourA2)),
    eyeColour: createTrait(childEyeA1, childEyeA2, expressedSimple(childEyeA1, childEyeA2)),
    skinColour: createTrait(childSkinA1, childSkinA2, expressedSimple(childSkinA1, childSkinA2)),
    whitePatches: createTrait(childWhiteA1, childWhiteA2, expressedWhitePatches(childWhiteA1, childWhiteA2)),
    isTortie: createTrait(childTortieA1, childTortieA2, childIsTortie),
    tortieData: createTrait(childTortieData, childTortieData, expressedTortieData),
  };
}

export function geneticsToParams(
  genetics: CatGenetics,
  baseParams: Partial<CatParams>,
  mutationPool?: { pelts: string[]; colours: string[]; tortieMasks: string[] }
): CatParams {
  // Spread baseParams first, then override with genetics-derived values
  // This ensures genetics takes precedence over baseParams for trait fields
  const { peltName: _, colour: _c, eyeColour: _e, skinColour: _s, whitePatches: _w, isTortie: _t, tortie: _tortie, tortieMask: _tm, tortieColour: _tc, tortiePattern: _tp, ...allowedOverrides } = baseParams;

  const result: CatParams = {
    spriteNumber: baseParams.spriteNumber ?? 0,
    shading: baseParams.shading ?? true,
    reverse: baseParams.reverse ?? false,
    ...allowedOverrides,
    // Genetics-derived values take precedence
    peltName: genetics.pelt.expressed,
    colour: genetics.colour.expressed,
    eyeColour: genetics.eyeColour.expressed,
    skinColour: genetics.skinColour.expressed,
    whitePatches: genetics.whitePatches.expressed ?? undefined,
    isTortie: genetics.isTortie.expressed,
  };

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
