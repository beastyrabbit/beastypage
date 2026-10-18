import type { QueryKey } from "@tanstack/react-query";

// Keys end at the last defined part: TanStack matches a prefix element by
// element, so a trailing `undefined` would match no query that has arguments.
const withArgs = (key: readonly unknown[], args: unknown): QueryKey =>
  args === undefined ? [...key] : [...key, args];

/** Stable, shared prefixes keep invalidation predictable across domain slices. */
export const dataQueryKeys = {
  all: ["data"] as const,
  query: (name: string, args?: unknown): QueryKey =>
    withArgs(["data", name], args),
  list: (name: string, args?: unknown): QueryKey =>
    withArgs(["data", name, "list"], args),
  detail: (name: string, id: string): QueryKey => ["data", name, "detail", id],
};
