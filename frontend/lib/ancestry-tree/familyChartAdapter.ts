import { encodeCatShare } from "@/lib/catShare";
import type { AncestryTreeCat, SerializedAncestryTree } from "./types";

export interface FamilyChartDatum {
  id: string;
  data: {
    id: string;
    "first name": string;
    "last name": string;
    "full name": string;
    gender: "M" | "F";
    generation: number;
    lifeStage: string;
    avatar?: string;
    catData: AncestryTreeCat;
  };
  rels: {
    parents: string[];
    spouses: string[];
    children: string[];
  };
}

function buildPreviewUrl(cat: AncestryTreeCat): string {
  const encoded = encodeCatShare({
    params: cat.params as unknown as Record<string, unknown>,
    accessorySlots: cat.params.accessories ?? [],
    scarSlots: cat.params.scars ?? [],
    tortieSlots: cat.params.tortie ?? [],
    counts: {
      accessories: cat.params.accessories?.length ?? 0,
      scars: cat.params.scars?.length ?? 0,
      tortie: cat.params.tortie?.length ?? 0,
    },
  });
  return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}

export function convertToFamilyChartFormat(
  tree: SerializedAncestryTree,
): FamilyChartDatum[] {
  const data: FamilyChartDatum[] = [];

  for (const cat of tree.cats) {
    // Build parents array from mother/father
    const parents: string[] = [];
    if (cat.motherId) parents.push(cat.motherId);
    if (cat.fatherId) parents.push(cat.fatherId);

    const datum: FamilyChartDatum = {
      id: cat.id,
      data: {
        id: cat.id,
        "first name": cat.name.prefix,
        "last name": cat.name.suffix,
        "full name": cat.name.full,
        gender: cat.gender,
        generation: cat.generation,
        lifeStage: cat.lifeStage,
        avatar: buildPreviewUrl(cat),
        catData: cat,
      },
      rels: {
        parents,
        spouses: [...(cat.partnerIds ?? [])],
        children: [...(cat.childrenIds ?? [])],
      },
    };

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
  tree: SerializedAncestryTree,
): Map<number, AncestryTreeCat[]> {
  const byGeneration = new Map<number, AncestryTreeCat[]>();

  for (const cat of tree.cats) {
    const gen = cat.generation;
    if (!byGeneration.has(gen)) {
      byGeneration.set(gen, []);
    }
    byGeneration.get(gen)?.push(cat);
  }

  return byGeneration;
}

export function findCatById(
  tree: SerializedAncestryTree,
  id: string,
): AncestryTreeCat | undefined {
  return tree.cats.find((cat) => cat.id === id);
}

function childIdsOf(cat: AncestryTreeCat): string[] {
  return Array.isArray(cat.childrenIds) ? cat.childrenIds : [];
}

function enqueueUnvisitedParents(
  cat: AncestryTreeCat,
  visited: Set<string>,
  queue: string[],
): void {
  for (const parentId of [cat.motherId, cat.fatherId]) {
    if (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      queue.push(parentId);
    }
  }
}

export function getDescendants(
  tree: SerializedAncestryTree,
  catId: string,
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat) return [];

  const descendants: AncestryTreeCat[] = [];
  const visited = new Set<string>([catId]);
  const queue = [...childIdsOf(cat)];

  while (queue.length > 0) {
    const childId = queue.shift()!;
    if (visited.has(childId)) continue;
    visited.add(childId);

    const child = findCatById(tree, childId);
    if (!child) continue;
    descendants.push(child);
    for (const grandchildId of childIdsOf(child)) {
      if (!visited.has(grandchildId)) {
        queue.push(grandchildId);
      }
    }
  }

  return descendants;
}

export function getAncestors(
  tree: SerializedAncestryTree,
  catId: string,
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat) return [];

  const ancestors: AncestryTreeCat[] = [];
  const visited = new Set<string>([catId]);
  const queue: string[] = [];

  enqueueUnvisitedParents(cat, visited, queue);

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = findCatById(tree, parentId);
    if (parent) {
      ancestors.push(parent);
      enqueueUnvisitedParents(parent, visited, queue);
    }
  }

  return ancestors;
}

export function getSiblings(
  tree: SerializedAncestryTree,
  catId: string,
): AncestryTreeCat[] {
  const cat = findCatById(tree, catId);
  if (!cat?.motherId || !cat.fatherId) return [];

  return tree.cats.filter(
    (c) =>
      c.id !== catId &&
      c.motherId === cat.motherId &&
      c.fatherId === cat.fatherId,
  );
}
