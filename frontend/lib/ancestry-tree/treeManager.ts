import type { CatParams } from '@/lib/cat-v3/types';
import type {
  AncestryTree,
  AncestryTreeCat,
  CatGenetics,
  CatId,
  CatName,
  FoundingCoupleInput,
  Gender,
  LifeStage,
  OffspringOptions,
  SerializedAncestryTree,
  TreeGenerationConfig,
} from './types';
import { DEFAULT_TREE_CONFIG, DEFAULT_OFFSPRING_OPTIONS } from './types';
import { createGeneticsFromParams, inheritGenetics, geneticsToParams } from './genetics';
import { generateWarriorName, pickOne } from './nameGenerator';

function generateId(): string {
  return crypto.randomUUID();
}

// Relationship constants
const MULTIPLE_PARTNERS_CHANCE = 0.20; // 20% chance for multiple partners

function generateSlug(): string {
  return `tree-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MutationPool {
  pelts: string[];
  colours: string[];
  eyeColours: string[];
  skinColours: string[];
  whitePatches: string[];
  spriteNumbers: number[];
  accessories: string[];
  scars: string[];
  tortieMasks: string[];
}

type RelationshipType = 'sibling' | 'cousin' | 'unrelated' | 'unknown';

export class AncestryTreeManager {
  private tree: AncestryTree;
  private usedNames: Set<string>;
  private mutationPool: MutationPool;
  // State for incremental generation (used by generateGeneration)
  private couplesPerGeneration: Array<{ motherId: CatId; fatherId: CatId }[]> = [];

  /**
   * Check relationship between two cats.
   * Siblings share both parents.
   * Cousins share at least one grandparent.
   */
  private getRelationship(cat1: AncestryTreeCat, cat2: AncestryTreeCat): RelationshipType {
    // Can't marry yourself
    if (cat1.id === cat2.id) return 'sibling';

    // Check for siblings (same parents)
    if (cat1.motherId && cat1.fatherId && cat2.motherId && cat2.fatherId) {
      if (cat1.motherId === cat2.motherId && cat1.fatherId === cat2.fatherId) {
        return 'sibling';
      }
    }

    // Check for half-siblings (share one parent)
    if (
      (cat1.motherId && cat1.motherId === cat2.motherId) ||
      (cat1.fatherId && cat1.fatherId === cat2.fatherId)
    ) {
      return 'sibling'; // Treat half-siblings as siblings for marriage purposes
    }

    // Check for cousins (share grandparents)
    const cat1Grandparents = this.getGrandparentIds(cat1);
    const cat2Grandparents = this.getGrandparentIds(cat2);

    for (const gp of cat1Grandparents) {
      if (cat2Grandparents.has(gp)) {
        return 'cousin';
      }
    }

    return 'unrelated';
  }

  /**
   * Get all grandparent IDs for a cat
   */
  private getGrandparentIds(cat: AncestryTreeCat): Set<string> {
    const grandparents = new Set<string>();

    if (cat.motherId) {
      const mother = this.tree.cats.get(cat.motherId);
      if (mother) {
        if (mother.motherId) grandparents.add(mother.motherId);
        if (mother.fatherId) grandparents.add(mother.fatherId);
      }
    }

    if (cat.fatherId) {
      const father = this.tree.cats.get(cat.fatherId);
      if (father) {
        if (father.motherId) grandparents.add(father.motherId);
        if (father.fatherId) grandparents.add(father.fatherId);
      }
    }

    return grandparents;
  }

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
      accessories: [],
      scars: [],
      tortieMasks: [],
    };
  }

  private pickAccessories(count: number): (string | null)[] {
    const result: (string | null)[] = [];
    const available = [...this.mutationPool.accessories];
    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      result.push(available.splice(idx, 1)[0]);
    }
    return result;
  }

  private pickScars(count: number): (string | null)[] {
    const result: (string | null)[] = [];
    const available = [...this.mutationPool.scars];
    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      result.push(available.splice(idx, 1)[0]);
    }
    return result;
  }

  private applyOffspringOptions(params: CatParams, options: OffspringOptions): CatParams {
    const result = { ...params };

    // Apply accessory chance
    if (options.accessoryChance > 0 && Math.random() < options.accessoryChance) {
      const count = Math.floor(Math.random() * options.maxAccessories) + 1;
      const accessories = this.pickAccessories(count);
      if (accessories.length > 0) {
        result.accessories = accessories;
        result.accessory = accessories[0] ?? undefined;
      }
    }

    // Apply scar chance
    if (options.scarChance > 0 && Math.random() < options.scarChance) {
      const count = Math.floor(Math.random() * options.maxScars) + 1;
      const scars = this.pickScars(count);
      if (scars.length > 0) {
        result.scars = scars;
        result.scar = scars[0] ?? undefined;
      }
    }

    return result;
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
    // Founders are warriors, offspring get random life stages for variety
    // (This breaks Warrior Cats lore where all kits have 'kit' suffix, but gives more name variety)
    const lifeStage: LifeStage = generation === 0
      ? 'warrior'
      : (['kit', 'apprentice', 'warrior'] as const)[Math.floor(Math.random() * 3)];
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
      partnerIds: [],
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
    mother.partnerIds.push(father.id);
    father.partnerIds.push(mother.id);

    this.tree.foundingMotherId = mother.id;
    this.tree.foundingFatherId = father.id;
    this.tree.updatedAt = Date.now();

    return { mother, father };
  }

  generateOffspring(
    motherId: CatId,
    fatherId: CatId,
    generation: number,
    forcedGender?: Gender
  ): AncestryTreeCat[] {
    const mother = this.tree.cats.get(motherId);
    const father = this.tree.cats.get(fatherId);

    if (!mother || !father) {
      throw new Error('Parent not found');
    }

    const { minChildren, maxChildren, genderRatio, offspringOptions } = this.tree.config;
    const effectiveOptions = offspringOptions ?? DEFAULT_OFFSPRING_OPTIONS;
    const childCount = Math.floor(Math.random() * (maxChildren - minChildren + 1)) + minChildren;
    const children: AncestryTreeCat[] = [];

    for (let i = 0; i < childCount; i++) {
      // Use forced gender for first child if provided, otherwise random
      const gender: Gender = (i === 0 && forcedGender) ? forcedGender : (Math.random() < genderRatio ? 'M' : 'F');

      const childGenetics = inheritGenetics(
        mother.genetics,
        father.genetics,
        gender,
        this.mutationPool
      );

      const spriteNumber = this.mutationPool.spriteNumbers.length > 0
        ? pickOne(this.mutationPool.spriteNumbers)
        : 0;

      let childParams = geneticsToParams(childGenetics, { spriteNumber }, {
        pelts: this.mutationPool.pelts,
        colours: this.mutationPool.colours,
        tortieMasks: this.mutationPool.tortieMasks,
      });

      // Apply offspring options (accessories/scars)
      childParams = this.applyOffspringOptions(childParams, effectiveOptions);

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

  /**
   * Prepare the tree for full generation.
   * Clears existing cats (keeping founding couple) and initializes generation tracking.
   * Call this before using generateGeneration() for incremental generation.
   */
  prepareForFullTree(): void {
    if (!this.tree.foundingMotherId || !this.tree.foundingFatherId) {
      throw new Error('Founding couple not initialized');
    }

    // Clear existing cats beyond generation 0 (keep founding couple)
    const foundingMother = this.tree.cats.get(this.tree.foundingMotherId);
    const foundingFather = this.tree.cats.get(this.tree.foundingFatherId);

    if (!foundingMother || !foundingFather) {
      throw new Error('Founding couple not found');
    }

    // Reset founding couple's children and preserve only them
    foundingMother.childrenIds = [];
    foundingFather.childrenIds = [];

    // Clear all cats and re-add founding couple
    this.tree.cats.clear();
    this.tree.cats.set(foundingMother.id, foundingMother);
    this.tree.cats.set(foundingFather.id, foundingFather);

    // Reset used names except founding couple
    this.usedNames.clear();
    this.usedNames.add(foundingMother.name.full.toLowerCase());
    this.usedNames.add(foundingFather.name.full.toLowerCase());

    // Initialize couples tracking with founding couple
    this.couplesPerGeneration = [
      [{ motherId: this.tree.foundingMotherId, fatherId: this.tree.foundingFatherId }],
    ];

    this.tree.updatedAt = Date.now();
  }

  /**
   * Generate a single generation of the tree.
   * Must call prepareForFullTree() first to initialize state.
   * @param generation - The generation number to generate (1 to depth)
   * @returns The number of cats generated in this generation
   */
  generateGeneration(generation: number): number {
    const { depth } = this.tree.config;

    if (generation < 1 || generation > depth) {
      throw new Error(`Invalid generation ${generation}, must be between 1 and ${depth}`);
    }

    if (generation > this.couplesPerGeneration.length) {
      throw new Error(`Cannot generate generation ${generation} - previous generation not generated yet`);
    }

    const previousCouples = this.couplesPerGeneration[generation - 1];
    const newCouples: Array<{ motherId: CatId; fatherId: CatId }> = [];
    let catsGenerated = 0;

    for (const couple of previousCouples) {
      const children = this.generateOffspring(couple.motherId, couple.fatherId, generation);
      catsGenerated += children.length;

      // Pair up children for next generation (if not last generation)
      if (generation < depth) {
        const { partnerChance } = this.tree.config;

        // Partner source chances
        const COUSIN_CHANCE = 0.01;        // 1% chance to marry a cousin
        const DISTANT_RELATIVE_CHANCE = 0.10;  // 10% chance to marry a distant relative

        // Process each child - both males and females have equal chance to find partners
        for (const child of children) {
          // Skip if already partnered
          if (child.partnerIds.length > 0) continue;

          // Check if this child finds a partner based on partnerChance
          if (Math.random() >= partnerChance) continue;

          // Age up to warrior
          child.lifeStage = 'warrior';
          child.name = {
            prefix: child.name.prefix,
            suffix: pickOne(['fur', 'pelt', 'tail', 'claw', 'heart', 'stripe', 'leaf', 'storm', 'wing', 'shine']),
            full: '',
          };
          child.name.full = child.name.prefix.charAt(0).toUpperCase() +
            child.name.prefix.slice(1).toLowerCase() +
            child.name.suffix;

          // Determine partner count (20% chance for multiple partners)
          const hasMultiplePartners = Math.random() < MULTIPLE_PARTNERS_CHANCE;
          const partnerCount = hasMultiplePartners ? 2 : 1;

          for (let p = 0; p < partnerCount; p++) {
            // Roll for partner source
            const roll = Math.random();
            let partner: AncestryTreeCat | undefined;

            // Get all potential partners from the tree (opposite gender, unpartnered, same generation)
            const oppositeGender: Gender = child.gender === 'F' ? 'M' : 'F';
            const allPotentialPartners = Array.from(this.tree.cats.values()).filter(
              (c) => c.gender === oppositeGender &&
                     c.generation === generation &&
                     c.partnerIds.length === 0 &&
                     c.id !== child.id
            );

            if (roll < COUSIN_CHANCE) {
              // Try to find a cousin (1% chance)
              partner = allPotentialPartners.find((c) => this.getRelationship(child, c) === 'cousin');
            } else if (roll < COUSIN_CHANCE + DISTANT_RELATIVE_CHANCE) {
              // Try to find a distant relative - someone from tree who isn't sibling or cousin (10% chance)
              partner = allPotentialPartners.find((c) => this.getRelationship(child, c) === 'unrelated');
            }
            // else: outsider (89% chance) - partner stays undefined

            if (!partner) {
              // Generate an outsider partner
              const tortiePool = {
                pelts: this.mutationPool.pelts,
                colours: this.mutationPool.colours,
                tortieMasks: this.mutationPool.tortieMasks,
              };
              const partnerGenetics = createGeneticsFromParams(
                {
                  ...geneticsToParams(child.genetics, {}, tortiePool),
                  peltName: this.mutationPool.pelts.length > 0 ? pickOne(this.mutationPool.pelts) : 'Tabby',
                  colour: this.mutationPool.colours.length > 0 ? pickOne(this.mutationPool.colours) : 'BLACK',
                },
                oppositeGender
              );

              const spriteNumber = this.mutationPool.spriteNumbers.length > 0
                ? pickOne(this.mutationPool.spriteNumbers)
                : 0;

              partner = this.createCat(
                geneticsToParams(partnerGenetics, { spriteNumber }, tortiePool),
                oppositeGender,
                generation,
                null,
                null,
                partnerGenetics
              );
              partner.lifeStage = 'warrior';
              catsGenerated++;
            } else {
              // Age up the partner found from the tree
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

            // Link both partners
            if (!child.partnerIds.includes(partner.id)) {
              child.partnerIds.push(partner.id);
            }
            if (!partner.partnerIds.includes(child.id)) {
              partner.partnerIds.push(child.id);
            }

            // Add to couples list (female first for consistency)
            const motherId = child.gender === 'F' ? child.id : partner.id;
            const fatherId = child.gender === 'M' ? child.id : partner.id;
            newCouples.push({ motherId, fatherId });
          }
        }
      }
    }

    this.couplesPerGeneration.push(newCouples);
    this.tree.updatedAt = Date.now();

    return catsGenerated;
  }

  /**
   * Generate the entire tree synchronously.
   * For non-blocking generation with progress, use prepareForFullTree() + generateGeneration() instead.
   */
  generateFullTree(): void {
    const { depth } = this.tree.config;

    this.prepareForFullTree();

    for (let gen = 1; gen <= depth; gen++) {
      this.generateGeneration(gen);
    }
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

    // Remove old partner links (clear all existing partners)
    for (const oldPartnerId of cat.partnerIds) {
      const oldPartner = this.tree.cats.get(oldPartnerId);
      if (oldPartner) {
        oldPartner.partnerIds = oldPartner.partnerIds.filter(id => id !== cat.id);
      }
    }
    cat.partnerIds = [];

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
    cat.partnerIds.push(newPartner.id);
    newPartner.partnerIds.push(cat.id);

    // Recalculate descendants if they had children
    if (cat.childrenIds.length > 0) {
      this.recalculateDescendants(cat.id, newPartner.id);
    }

    this.tree.updatedAt = Date.now();
    return newPartner;
  }

  /**
   * Assign a partner to an unpartnered cat and optionally generate offspring.
   * Unlike replacePartner, this is for cats that don't have a partner yet.
   */
  assignPartner(
    catId: CatId,
    newPartnerParams: CatParams,
    newPartnerName?: { prefix: string; suffix: string; full: string },
    generateChildren = false
  ): AncestryTreeCat {
    const cat = this.tree.cats.get(catId);
    if (!cat) {
      throw new Error('Cat not found');
    }

    // Create new partner (allows multiple spouses)
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

    // Link partners (add to arrays for multiple spouse support)
    cat.partnerIds.push(newPartner.id);
    newPartner.partnerIds.push(cat.id);

    // Generate offspring if requested and not at max depth
    if (generateChildren && cat.generation < this.tree.config.depth) {
      const motherId = cat.gender === 'F' ? cat.id : newPartner.id;
      const fatherId = cat.gender === 'M' ? cat.id : newPartner.id;
      this.generateOffspring(motherId, fatherId, cat.generation + 1);
    }

    this.tree.updatedAt = Date.now();
    return newPartner;
  }

  /**
   * Adds a parent (father or mother) to a cat that doesn't have one.
   * This is useful for extending the tree upward from the founding couple.
   */
  addParent(
    childId: CatId,
    parentParams: CatParams,
    parentType: 'father' | 'mother',
    parentName?: CatName
  ): AncestryTreeCat | null {
    const child = this.tree.cats.get(childId);
    if (!child) return null;

    // Check if parent already exists
    if (parentType === 'father' && child.fatherId) {
      console.warn('[addParent] Cat already has a father');
      return null;
    }
    if (parentType === 'mother' && child.motherId) {
      console.warn('[addParent] Cat already has a mother');
      return null;
    }

    const parentGender: Gender = parentType === 'father' ? 'M' : 'F';
    const name = parentName ?? generateWarriorName('warrior');

    // Create genetics from params
    const genetics = createGeneticsFromParams(parentParams, parentGender);

    // Parent is one generation above the child
    const parentGeneration = child.generation - 1;

    const newParent = this.createCat(
      parentParams,
      parentGender,
      parentGeneration,
      null, // No grandparents
      null,
      genetics,
      'generated',
      undefined,
      name
    );

    // Add to tree
    this.tree.cats.set(newParent.id, newParent);

    // Update child's parent reference
    if (parentType === 'father') {
      child.fatherId = newParent.id;
    } else {
      child.motherId = newParent.id;
    }

    // Add child to parent's children list
    newParent.childrenIds.push(child.id);

    // If the child has the other parent, make them partners
    const otherParentId = parentType === 'father' ? child.motherId : child.fatherId;
    if (otherParentId) {
      const otherParent = this.tree.cats.get(otherParentId);
      if (otherParent) {
        newParent.partnerIds.push(otherParentId);
        if (!otherParent.partnerIds.includes(newParent.id)) {
          otherParent.partnerIds.push(newParent.id);
        }
        // Add child to other parent's children if not already there
        if (!otherParent.childrenIds.includes(child.id)) {
          otherParent.childrenIds.push(child.id);
        }
      }
    }

    this.tree.updatedAt = Date.now();
    return newParent;
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
      }, {
        pelts: this.mutationPool.pelts,
        colours: this.mutationPool.colours,
        tortieMasks: this.mutationPool.tortieMasks,
      });

      // Add child to new partner's children list
      if (!newPartner.childrenIds.includes(childId)) {
        newPartner.childrenIds.push(childId);
      }

      // Recursively update descendants (use first partner for recalculation)
      if (child.partnerIds.length > 0 && child.childrenIds.length > 0) {
        this.recalculateDescendants(child.id, child.partnerIds[0]);
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

    // Migrate cats from old partnerId format to new partnerIds array format
    const migratedCats = data.cats.map((cat) => {
      // If cat already has partnerIds array, use it; otherwise migrate from partnerId
      const legacyCat = cat as AncestryTreeCat & { partnerId?: string | null };
      const partnerIds = cat.partnerIds ?? (legacyCat.partnerId ? [legacyCat.partnerId] : []);

      return {
        ...cat,
        partnerIds,
      };
    });

    manager.tree = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      foundingMotherId: data.foundingMotherId,
      foundingFatherId: data.foundingFatherId,
      cats: new Map(migratedCats.map((cat) => [cat.id, cat])),
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
