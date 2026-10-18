"use client";

import { fetchJson } from "@/lib/api";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

type Profile = any;
type Batch = any;
type Tree = any;

export function useCatProfile(
  slugOrId: string | null | undefined,
): Profile | undefined {
  return useDataQuery(slugOrId ? { slugOrId } : "skip", {
    queryKey: dataQueryKeys.detail("cat-profile", slugOrId ?? "none"),
    queryFn: (args) =>
      fetchJson<Profile>(
        `/api/cats/profile?slugOrId=${encodeURIComponent(args.slugOrId)}`,
        { nullable: true },
      ),
  });
}

export function useCatHistory(limit = 200) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("cat-history", { limit }),
      queryFn: (args) =>
        fetchJson<NonNullable<any>>(`/api/cats/history?limit=${args.limit}`),
    },
  );
}

export function useAdoptionBatch(
  slugOrId: string | null | undefined,
): Batch | undefined {
  return useDataQuery(slugOrId ? { slugOrId } : "skip", {
    queryKey: dataQueryKeys.detail("adoption-batch", slugOrId ?? "none"),
    queryFn: (args) =>
      fetchJson<Batch>(
        `/api/adoption/batch?slugOrId=${encodeURIComponent(args.slugOrId)}`,
        { nullable: true },
      ),
  });
}

export function useAdoptionHistory(limit = 50) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("adoption-history", { limit }),
      queryFn: (args) =>
        fetchJson<NonNullable<any>>(
          `/api/adoption/batches?limit=${args.limit}`,
        ),
    },
  );
}

export function useAncestryTree(
  slug: string | null | undefined,
): Tree | undefined {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.detail("ancestry-tree", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<Tree>(
        `/api/ancestry/tree?slug=${encodeURIComponent(args.slug)}`,
        { nullable: true },
      ),
  });
}

export function useAncestryHistory(limit = 20) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("ancestry-history", { limit }),
      queryFn: (args) =>
        fetchJson<NonNullable<any>>(`/api/ancestry/trees?limit=${args.limit}`),
    },
  );
}

export function useAncestrySlugCheck(slug: string | null | undefined) {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.query("ancestry-slug", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<any>(
        `/api/ancestry/check-slug?slug=${encodeURIComponent(args.slug)}`,
      ),
  });
}

export function useCatCreate() {
  return useDataMutation({
    mutationFn: (args) =>
      fetchJson<any>("/api/cats/profile", { method: "POST", body: args }),
  });
}
export function useCatUpdateMeta() {
  return useDataMutation({
    mutationFn: (args) =>
      fetchJson<any>("/api/cats/profile", { method: "PATCH", body: args }),
  });
}
export function useAdoptionCreate() {
  return useDataMutation({
    mutationFn: (args) =>
      fetchJson<any>("/api/adoption/batch", { method: "POST", body: args }),
  });
}
export function useAdoptionUpdateMeta() {
  return useDataMutation({
    mutationFn: (args) =>
      fetchJson<any>("/api/adoption/batch", { method: "PATCH", body: args }),
  });
}

type TreeSaveArgs = any;
export function useAncestrySave() {
  return useDataMutation({
    mutationFn: (args) =>
      fetchJson<any>("/api/ancestry/tree", {
        method: "POST",
        body: { ...args, operation: "save" },
      }),
  });
}
export function useAncestrySaveAsNew() {
  return useDataMutation({
    mutationFn: (args: TreeSaveArgs) =>
      fetchJson<any>("/api/ancestry/tree", {
        method: "POST",
        body: { ...args, operation: "saveAsNew" },
      }),
  });
}

export function usePaletteRecord(slug: string | null | undefined) {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.detail("palette-settings", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<any>(
        `/api/palette-generator-settings?slug=${encodeURIComponent(args.slug)}`,
        { nullable: true },
      ),
  });
}
export function usePaletteImageUrl(slug: string | null | undefined) {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.detail("palette-image", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<string | null>(
        `/api/palette-generator-settings/image?slug=${encodeURIComponent(args.slug ?? "")}`,
        { nullable: true },
      ),
  });
}
