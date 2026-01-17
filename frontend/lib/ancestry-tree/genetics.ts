import type { CatParams } from '@/lib/cat-v3/types';
import type { CatGenetics, GeneticTrait, Gender } from './types';
import { pickOne } from './nameGenerator';

const MUTATION_RATE = 0.05;

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

export function createGeneticsFromParams(params: CatParams, gender: Gender): CatGenetics {
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
    isTortie: createTrait(params.isTortie, params.isTortie, params.isTortie),
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

  // Tortie mutation is rare
  const childTortieA1 = roll(MUTATION_RATE * 0.5) ? !motherTortie : motherTortie;
  const childTortieA2 = roll(MUTATION_RATE * 0.5) ? !fatherTortie : fatherTortie;

  return {
    pelt: createTrait(childPeltA1, childPeltA2, expressedPelt(childPeltA1, childPeltA2)),
    colour: createTrait(childColourA1, childColourA2, expressedSimple(childColourA1, childColourA2)),
    eyeColour: createTrait(childEyeA1, childEyeA2, expressedSimple(childEyeA1, childEyeA2)),
    skinColour: createTrait(childSkinA1, childSkinA2, expressedSimple(childSkinA1, childSkinA2)),
    whitePatches: createTrait(childWhiteA1, childWhiteA2, expressedWhitePatches(childWhiteA1, childWhiteA2)),
    isTortie: createTrait(childTortieA1, childTortieA2, expressedTortie(childTortieA1, childTortieA2, childGender)),
  };
}

export function geneticsToParams(genetics: CatGenetics, baseParams: Partial<CatParams>): CatParams {
  return {
    spriteNumber: baseParams.spriteNumber ?? 0,
    peltName: genetics.pelt.expressed,
    colour: genetics.colour.expressed,
    eyeColour: genetics.eyeColour.expressed,
    skinColour: genetics.skinColour.expressed,
    whitePatches: genetics.whitePatches.expressed ?? undefined,
    isTortie: genetics.isTortie.expressed,
    shading: baseParams.shading ?? true,
    reverse: baseParams.reverse ?? false,
    ...baseParams,
  };
}
