import type { CatParams } from '@/lib/cat-v3/types';
import type {
  AncestryTree,
  AncestryTreeCat,
  CatGenetics,
  CatId,
  FoundingCoupleInput,
  Gender,
  LifeStage,
  SerializedAncestryTree,
  TreeGenerationConfig,
} from './types';
import { DEFAULT_TREE_CONFIG } from './types';
import { createGeneticsFromParams, inheritGenetics, geneticsToParams } from './genetics';
import { generateWarriorName, pickOne } from './nameGenerator';

function generateId(): string {
  return crypto.randomUUID();
}

function generateSlug(): string {
  return `tree-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface MutationPool {
  pelts: string[];
  colours: string[];
  eyeColours: string[];
  skinColours: string[];
  whitePatches: string[];
  spriteNumbers: number[];
}

export class AncestryTreeManager {
  private tree: AncestryTree;
  private usedNames: Set<string>;
  private mutationPool: MutationPool;

  constructor(mutationPool?: MutationPool) {
    this.tree = {
      id: generateId(),
      slug: generateSlug(),
      name: 'Unnamed Tree',
      foundingMotherId: '',
      foundingFatherId: '',
      cats: new Map(),
      config: { ...DEFAULT_TREE_CONFIG },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.usedNames = new Set();
    this.mutationPool = mutationPool ?? {
      pelts: [],
      colours: [],
      eyeColours: [],
      skinColours: [],
      whitePatches: [],
      spriteNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
  }

  setMutationPool(pool: MutationPool): void {
    this.mutationPool = pool;
  }

  setConfig(config: Partial<TreeGenerationConfig>): void {
    this.tree.config = { ...this.tree.config, ...config };
    this.tree.updatedAt = Date.now();
  }

  setName(name: string): void {
    this.tree.name = name;
    this.tree.updatedAt = Date.now();
  }

  getTree(): AncestryTree {
    return this.tree;
  }

  getCat(id: CatId): AncestryTreeCat | undefined {
    return this.tree.cats.get(id);
  }

  getAllCats(): AncestryTreeCat[] {
    return Array.from(this.tree.cats.values());
  }

  private createCat(
    params: CatParams,
    gender: Gender,
    generation: number,
    motherId: CatId | null,
    fatherId: CatId | null,
    genetics: CatGenetics,
    source: 'history' | 'generated' | 'edited' = 'generated',
    historyProfileId?: string,
    existingName?: { prefix: string; suffix: string; full: string }
  ): AncestryTreeCat {
    const lifeStage: LifeStage = generation === 0 ? 'warrior' : 'kit';
    const name = existingName ?? generateWarriorName(lifeStage, this.usedNames);
    this.usedNames.add(name.full.toLowerCase());

    const cat: AncestryTreeCat = {
      id: generateId(),
      name,
      gender,
      lifeStage,
      params,
      motherId,
      fatherId,
      partnerId: null,
      childrenIds: [],
      genetics,
      source,
      historyProfileId,
      generation,
    };

    this.tree.cats.set(cat.id, cat);
    return cat;
  }

  initializeFoundingCouple(input: FoundingCoupleInput): { mother: AncestryTreeCat; father: AncestryTreeCat } {
    // Clear existing tree
    this.tree.cats.clear();
    this.usedNames.clear();

    const motherGenetics = createGeneticsFromParams(input.mother.params, 'F');
    const mother = this.createCat(
      input.mother.params,
      'F',
      0,
      null,
      null,
      motherGenetics,
      input.mother.historyProfileId ? 'history' : 'generated',
      input.mother.historyProfileId,
      input.mother.name
    );

    const fatherGenetics = createGeneticsFromParams(input.father.params, 'M');
    const father = this.createCat(
      input.father.params,
      'M',
      0,
      null,
      null,
      fatherGenetics,
      input.father.historyProfileId ? 'history' : 'generated',
      input.father.historyProfileId,
      input.father.name
    );

    // Link partners
    mother.partnerId = father.id;
    father.partnerId = mother.id;

    this.tree.foundingMotherId = mother.id;
    this.tree.foundingFatherId = father.id;
    this.tree.updatedAt = Date.now();

    return { mother, father };
  }

  generateOffspring(
    motherId: CatId,
    fatherId: CatId,
    generation: number
  ): AncestryTreeCat[] {
    const mother = this.tree.cats.get(motherId);
    const father = this.tree.cats.get(fatherId);

    if (!mother || !father) {
      throw new Error('Parent not found');
    }

    const { minChildren, maxChildren, genderRatio } = this.tree.config;
    const childCount = Math.floor(Math.random() * (maxChildren - minChildren + 1)) + minChildren;
    const children: AncestryTreeCat[] = [];

    for (let i = 0; i < childCount; i++) {
      const gender: Gender = Math.random() < genderRatio ? 'M' : 'F';

      const childGenetics = inheritGenetics(
        mother.genetics,
        father.genetics,
        gender,
        this.mutationPool
      );

      const spriteNumber = this.mutationPool.spriteNumbers.length > 0
        ? pickOne(this.mutationPool.spriteNumbers)
        : 0;

      const childParams = geneticsToParams(childGenetics, { spriteNumber });

      const child = this.createCat(
        childParams,
        gender,
        generation,
        motherId,
        fatherId,
        childGenetics
      );

      children.push(child);
      mother.childrenIds.push(child.id);
      father.childrenIds.push(child.id);
    }

    this.tree.updatedAt = Date.now();
    return children;
  }

  generateFullTree(): void {
    const { depth } = this.tree.config;

    if (!this.tree.foundingMotherId || !this.tree.foundingFatherId) {
      throw new Error('Founding couple not initialized');
    }

    // Generate offspring for each generation
    const couplesPerGeneration: Array<{ motherId: CatId; fatherId: CatId }[]> = [
      [{ motherId: this.tree.foundingMotherId, fatherId: this.tree.foundingFatherId }],
    ];

    for (let gen = 1; gen <= depth; gen++) {
      const previousCouples = couplesPerGeneration[gen - 1];
      const newCouples: Array<{ motherId: CatId; fatherId: CatId }> = [];

      for (const couple of previousCouples) {
        const children = this.generateOffspring(couple.motherId, couple.fatherId, gen);

        // Pair up children for next generation (if not last generation)
        if (gen < depth) {
          const females = children.filter((c) => c.gender === 'F');
          const males = children.filter((c) => c.gender === 'M');

          // Create couples from children (age them up to warriors)
          for (const female of females) {
            female.lifeStage = 'warrior';
            female.name = {
              prefix: female.name.prefix,
              suffix: pickOne(['fur', 'pelt', 'tail', 'claw', 'heart', 'stripe', 'leaf', 'storm', 'wing', 'shine']),
              full: '',
            };
            female.name.full = female.name.prefix.charAt(0).toUpperCase() +
              female.name.prefix.slice(1).toLowerCase() +
              female.name.suffix;

            // Find or generate a partner
            let partner: AncestryTreeCat | undefined;

            // First try to find an unpartnered male from the same litter (full siblings only)
            partner = males.find((m) =>
              !m.partnerId &&
              m.fatherId === female.fatherId &&
              m.motherId === female.motherId &&
              m.id !== female.id
            );

            if (!partner) {
              // Generate a new partner from outside the family
              const partnerGender: Gender = 'M';
              const partnerGenetics = createGeneticsFromParams(
                {
                  ...geneticsToParams(female.genetics, {}),
                  peltName: this.mutationPool.pelts.length > 0 ? pickOne(this.mutationPool.pelts) : 'Tabby',
                  colour: this.mutationPool.colours.length > 0 ? pickOne(this.mutationPool.colours) : 'BLACK',
                },
                partnerGender
              );

              const spriteNumber = this.mutationPool.spriteNumbers.length > 0
                ? pickOne(this.mutationPool.spriteNumbers)
                : 0;

              partner = this.createCat(
                geneticsToParams(partnerGenetics, { spriteNumber }),
                partnerGender,
                gen,
                null,
                null,
                partnerGenetics
              );
              partner.lifeStage = 'warrior';
            } else {
              // Age up the male partner
              partner.lifeStage = 'warrior';
              partner.name = {
                prefix: partner.name.prefix,
                suffix: pickOne(['fur', 'pelt', 'tail', 'claw', 'heart', 'stripe', 'leaf', 'storm', 'wing', 'shine']),
                full: '',
              };
              partner.name.full = partner.name.prefix.charAt(0).toUpperCase() +
                partner.name.prefix.slice(1).toLowerCase() +
                partner.name.suffix;
            }

            // Link partners
            female.partnerId = partner.id;
            partner.partnerId = female.id;

            newCouples.push({ motherId: female.id, fatherId: partner.id });
          }
        }
      }

      couplesPerGeneration.push(newCouples);
    }

    this.tree.updatedAt = Date.now();
  }

  replacePartner(
    catId: CatId,
    newPartnerParams: CatParams,
    newPartnerName?: { prefix: string; suffix: string; full: string }
  ): AncestryTreeCat {
    const cat = this.tree.cats.get(catId);
    if (!cat) {
      throw new Error('Cat not found');
    }

    // Remove old partner link
    if (cat.partnerId) {
      const oldPartner = this.tree.cats.get(cat.partnerId);
      if (oldPartner) {
        oldPartner.partnerId = null;
      }
    }

    // Create new partner
    const newPartnerGender: Gender = cat.gender === 'F' ? 'M' : 'F';
    const newPartnerGenetics = createGeneticsFromParams(newPartnerParams, newPartnerGender);

    const newPartner = this.createCat(
      newPartnerParams,
      newPartnerGender,
      cat.generation,
      null,
      null,
      newPartnerGenetics,
      'generated',
      undefined,
      newPartnerName
    );

    newPartner.lifeStage = cat.lifeStage;

    // Link partners
    cat.partnerId = newPartner.id;
    newPartner.partnerId = cat.id;

    // Recalculate descendants if they had children
    if (cat.childrenIds.length > 0) {
      this.recalculateDescendants(cat.id, newPartner.id);
    }

    this.tree.updatedAt = Date.now();
    return newPartner;
  }

  private recalculateDescendants(parentId: CatId, newPartnerId: CatId): void {
    const parent = this.tree.cats.get(parentId);
    const newPartner = this.tree.cats.get(newPartnerId);

    if (!parent || !newPartner) return;

    // Get all children and recalculate their genetics
    for (const childId of parent.childrenIds) {
      const child = this.tree.cats.get(childId);
      if (!child) continue;

      // Update parent reference
      if (parent.gender === 'F') {
        child.fatherId = newPartnerId;
      } else {
        child.motherId = newPartnerId;
      }

      // Recalculate genetics
      const mother = parent.gender === 'F' ? parent : newPartner;
      const father = parent.gender === 'M' ? parent : newPartner;

      child.genetics = inheritGenetics(
        mother.genetics,
        father.genetics,
        child.gender,
        this.mutationPool
      );

      // Update params based on new genetics
      child.params = geneticsToParams(child.genetics, {
        spriteNumber: child.params.spriteNumber,
        shading: child.params.shading,
        reverse: child.params.reverse,
      });

      // Add child to new partner's children list
      if (!newPartner.childrenIds.includes(childId)) {
        newPartner.childrenIds.push(childId);
      }

      // Recursively update descendants
      if (child.partnerId && child.childrenIds.length > 0) {
        this.recalculateDescendants(child.id, child.partnerId);
      }
    }
  }

  serialize(): SerializedAncestryTree {
    return {
      id: this.tree.id,
      slug: this.tree.slug,
      name: this.tree.name,
      foundingMotherId: this.tree.foundingMotherId,
      foundingFatherId: this.tree.foundingFatherId,
      cats: Array.from(this.tree.cats.values()),
      config: this.tree.config,
      createdAt: this.tree.createdAt,
      updatedAt: this.tree.updatedAt,
      creatorName: this.tree.creatorName,
    };
  }

  static deserialize(data: SerializedAncestryTree, mutationPool?: MutationPool): AncestryTreeManager {
    const manager = new AncestryTreeManager(mutationPool);
    manager.tree = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      foundingMotherId: data.foundingMotherId,
      foundingFatherId: data.foundingFatherId,
      cats: new Map(data.cats.map((cat) => [cat.id, cat])),
      config: data.config,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      creatorName: data.creatorName,
    };

    // Rebuild used names set
    manager.usedNames = new Set(data.cats.map((cat) => cat.name.full.toLowerCase()));

    return manager;
  }
}

export function createTreeManager(mutationPool?: MutationPool): AncestryTreeManager {
  return new AncestryTreeManager(mutationPool);
}
