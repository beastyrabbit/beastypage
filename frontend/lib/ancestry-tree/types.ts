import type { CatParams } from '@/lib/cat-v3/types';

export type CatId = string;
export type Gender = 'M' | 'F';
export type LifeStage = 'kit' | 'apprentice' | 'warrior' | 'leader' | 'elder';
export type CatSource = 'history' | 'generated' | 'edited';

export interface CatName {
  prefix: string;
  suffix: string;
  full: string;
}

export interface GeneticTrait<T> {
  allele1: T;
  allele2: T;
  expressed: T;
}

export interface TortieGenetics {
  // Whether tortie gene is present
  hasTortieGene: boolean;
  // Inherited tortie layer data (patterns, masks, colors)
  patterns: string[];  // Pelt patterns for tortie patches
  masks: string[];     // Tortie mask shapes
  colours: string[];   // Tortie patch colors
}

export interface CatGenetics {
  pelt: GeneticTrait<string>;
  colour: GeneticTrait<string>;
  eyeColour: GeneticTrait<string>;
  skinColour: GeneticTrait<string>;
  whitePatches: GeneticTrait<string | null>;
  isTortie: GeneticTrait<boolean>;
  // Enhanced tortie genetics
  tortieData: GeneticTrait<TortieGenetics | null>;
}

export interface AncestryTreeCat {
  id: CatId;
  name: CatName;
  gender: Gender;
  lifeStage: LifeStage;
  params: CatParams;
  motherId: CatId | null;
  fatherId: CatId | null;
  partnerIds: CatId[];
  childrenIds: CatId[];
  genetics: CatGenetics;
  source: CatSource;
  historyProfileId?: string;
  generation: number;
}

export interface OffspringOptions {
  accessoryChance: number;  // 0, 0.25, 0.5, 0.75, 1.0
  scarChance: number;       // 0, 0.25, 0.5, 0.75, 1.0
  maxAccessories: number;   // 1-4
  maxScars: number;         // 1-4
}

export const DEFAULT_OFFSPRING_OPTIONS: OffspringOptions = {
  accessoryChance: 0,
  scarChance: 0,
  maxAccessories: 1,
  maxScars: 1,
};

export type PaletteMode = 'off' | 'mood' | 'bold' | 'darker' | 'blackout';

export interface TreeGenerationConfig {
  minChildren: number;
  maxChildren: number;
  depth: number;
  genderRatio: number;
  offspringOptions?: OffspringOptions;
  paletteModes?: PaletteMode[];  // Multiple palettes can be enabled
}

export const DEFAULT_TREE_CONFIG: TreeGenerationConfig = {
  minChildren: 1,
  maxChildren: 5,
  depth: 3,
  genderRatio: 0.5,
  offspringOptions: DEFAULT_OFFSPRING_OPTIONS,
  paletteModes: ['off'],  // Classic only by default
};

export interface AncestryTree {
  id: string;
  slug: string;
  name: string;
  foundingMotherId: CatId;
  foundingFatherId: CatId;
  cats: Map<CatId, AncestryTreeCat>;
  config: TreeGenerationConfig;
  createdAt: number;
  updatedAt: number;
  creatorName?: string;
}

export interface SerializedAncestryTree {
  id: string;
  slug: string;
  name: string;
  foundingMotherId: CatId;
  foundingFatherId: CatId;
  cats: AncestryTreeCat[];
  config: TreeGenerationConfig;
  createdAt: number;
  updatedAt: number;
  creatorName?: string;
}

export interface FoundingCoupleInput {
  mother: {
    params: CatParams;
    name?: CatName;
    historyProfileId?: string;
  };
  father: {
    params: CatParams;
    name?: CatName;
    historyProfileId?: string;
  };
}
