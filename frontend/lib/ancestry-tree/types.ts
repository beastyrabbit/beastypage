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

export interface CatGenetics {
  pelt: GeneticTrait<string>;
  colour: GeneticTrait<string>;
  eyeColour: GeneticTrait<string>;
  skinColour: GeneticTrait<string>;
  whitePatches: GeneticTrait<string | null>;
  isTortie: GeneticTrait<boolean>;
}

export interface AncestryTreeCat {
  id: CatId;
  name: CatName;
  gender: Gender;
  lifeStage: LifeStage;
  params: CatParams;
  motherId: CatId | null;
  fatherId: CatId | null;
  partnerId: CatId | null;
  childrenIds: CatId[];
  genetics: CatGenetics;
  source: CatSource;
  historyProfileId?: string;
  generation: number;
}

export interface TreeGenerationConfig {
  minChildren: number;
  maxChildren: number;
  depth: number;
  genderRatio: number;
}

export const DEFAULT_TREE_CONFIG: TreeGenerationConfig = {
  minChildren: 1,
  maxChildren: 5,
  depth: 3,
  genderRatio: 0.5,
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
