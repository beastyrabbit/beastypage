import type { AncestryTreeCat, SerializedAncestryTree } from './types';

export interface FamilyChartDatum {
  id: string;
  data: {
    id: string;
    name: string;
    gender: 'M' | 'F';
    generation: number;
    lifeStage: string;
    avatar?: string;
    catData: AncestryTreeCat;
  };
  rels: {
    spouses?: string[];
    father?: string;
    mother?: string;
    children?: string[];
  };
}

export function convertToFamilyChartFormat(
  tree: SerializedAncestryTree,
  catAvatars?: Map<string, string>
): FamilyChartDatum[] {
  const data: FamilyChartDatum[] = [];

  for (const cat of tree.cats) {
    const datum: FamilyChartDatum = {
      id: cat.id,
      data: {
        id: cat.id,
        name: cat.name.full,
        gender: cat.gender,
        generation: cat.generation,
        lifeStage: cat.lifeStage,
        avatar: catAvatars?.get(cat.id),
        catData: cat,
      },
      rels: {},
    };

    if (cat.partnerId) {
      datum.rels.spouses = [cat.partnerId];
    }

    if (cat.motherId) {
      datum.rels.mother = cat.motherId;
    }

    if (cat.fatherId) {
      datum.rels.father = cat.fatherId;
    }

    if (cat.childrenIds.length > 0) {
      datum.rels.children = cat.childrenIds;
    }

    data.push(datum);
  }

  return data;
}

export function getFoundingCoupleIds(tree: SerializedAncestryTree): {
  motherId: string;
  fatherId: string;
} {
  return {
    motherId: tree.foundingMotherId,
    fatherId: tree.foundingFatherId,
  };
}

export function getCatsByGeneration(
  tree: SerializedAncestryTree
): Map<number, AncestryTreeCat[]> {
  const byGeneration = new Map<number, AncestryTreeCat[]>();

  for (const cat of tree.cats) {
    const gen = cat.generation;
    if (!byGeneration.has(gen)) {
      byGeneration.set(gen, []);
    }
    byGeneration.get(gen)!.push(cat);
  }

  return byGeneration;
}

export function findCatById(
  tree: SerializedAncestryTree,
  id: string
): AncestryTreeCat | undefined {
  return tree.cats.find((cat) => cat.id === id);
}

export function getDescendants(
  tree: SerializedAncestryTree,
  catId: string
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat) return [];

  const descendants: AncestryTreeCat[] = [];
  const visited = new Set<string>([catId]);
  const queue = [...cat.childrenIds];

  while (queue.length > 0) {
    const childId = queue.shift()!;
    if (visited.has(childId)) continue;
    visited.add(childId);

    const child = findCatById(tree, childId);
    if (child) {
      descendants.push(child);
      for (const grandchildId of child.childrenIds) {
        if (!visited.has(grandchildId)) {
          queue.push(grandchildId);
        }
      }
    }
  }

  return descendants;
}

export function getAncestors(
  tree: SerializedAncestryTree,
  catId: string
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat) return [];

  const ancestors: AncestryTreeCat[] = [];
  const queue: string[] = [];

  if (cat.motherId) queue.push(cat.motherId);
  if (cat.fatherId) queue.push(cat.fatherId);

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = findCatById(tree, parentId);
    if (parent) {
      ancestors.push(parent);
      if (parent.motherId) queue.push(parent.motherId);
      if (parent.fatherId) queue.push(parent.fatherId);
    }
  }

  return ancestors;
}

export function getSiblings(
  tree: SerializedAncestryTree,
  catId: string
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat || !cat.motherId || !cat.fatherId) return [];

  return tree.cats.filter(
    (c) =>
      c.id !== catId &&
      c.motherId === cat.motherId &&
      c.fatherId === cat.fatherId
  );
}

