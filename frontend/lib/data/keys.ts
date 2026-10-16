import type { QueryKey } from "@tanstack/react-query";

/** Stable, shared prefixes keep invalidation predictable across domain slices. */
export const dataQueryKeys = {
  all: ["data"] as const,
  query: (name: string, args?: unknown): QueryKey => ["data", name, args],
  list: (name: string, args?: unknown): QueryKey => [
    "data",
    name,
    "list",
    args,
  ],
  detail: (name: string, id: string): QueryKey => ["data", name, "detail", id],
};

export function dataQueryKey(name: string, args?: unknown): QueryKey {
  return dataQueryKeys.query(name, args);
}
