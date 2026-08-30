import type { CatDocument } from "./runtime";

export interface StoredCat<TId extends string = string> {
  id: TId;
  document: CatDocument;
  createdAt: number;
  updatedAt: number;
}

export interface CatPage<TId extends string = string, TCursor = string> {
  items: StoredCat<TId>[];
  nextCursor: TCursor | null;
}

/**
 * Persistence boundary for cat documents. Implementations may use Convex,
 * another database or local storage; cat-system consumers only depend on this
 * interface and never on database-specific trait fields.
 */
export interface CatStore<TId extends string = string, TCursor = string> {
  save(document: CatDocument, id?: TId): Promise<StoredCat<TId>>;
  load(id: TId): Promise<StoredCat<TId> | null>;
  listPage(options?: {
    cursor?: TCursor | null;
    limit?: number;
  }): Promise<CatPage<TId, TCursor>>;
  delete(id: TId): Promise<void>;
}
