"use client";

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { fetchJson } from "@/lib/api";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

type Profile = FunctionReturnType<typeof api.mapper.getBySlug>;
type Batch = FunctionReturnType<typeof api.adoptionV2.getBySlug>;
type Tree = FunctionReturnType<typeof api.ancestryTree.getBySlug>;

export function useCatProfile(
  slugOrId: string | null | undefined,
): Profile | undefined {
  return useDataQuery(api.mapper.getBySlug, slugOrId ? { slugOrId } : "skip", {
    queryKey: dataQueryKeys.detail("cat-profile", slugOrId ?? "none"),
    queryFn: (args) =>
      fetchJson<Profile>(
        `/api/cats/profile?slugOrId=${encodeURIComponent(args.slugOrId)}`,
      ),
  });
}

export function useCatHistory(limit = 200) {
  return useDataQuery(
    api.mapper.listHistory,
    { limit },
    {
      queryKey: dataQueryKeys.list("cat-history", { limit }),
      queryFn: (args) =>
        fetchJson<
          NonNullable<FunctionReturnType<typeof api.mapper.listHistory>>
        >(`/api/cats/history?limit=${args.limit}`),
    },
  );
}

export function useAdoptionBatch(
  slugOrId: string | null | undefined,
): Batch | undefined {
  return useDataQuery(
    api.adoptionV2.getBySlug,
    slugOrId ? { slugOrId } : "skip",
    {
      queryKey: dataQueryKeys.detail("adoption-batch", slugOrId ?? "none"),
      queryFn: (args) =>
        fetchJson<Batch>(
          `/api/adoption/batch?slugOrId=${encodeURIComponent(args.slugOrId)}`,
        ),
    },
  );
}

export function useAdoptionHistory(limit = 50) {
  return useDataQuery(
    api.adoptionV2.listBatches,
    { limit },
    {
      queryKey: dataQueryKeys.list("adoption-history", { limit }),
      queryFn: (args) =>
        fetchJson<
          NonNullable<FunctionReturnType<typeof api.adoptionV2.listBatches>>
        >(`/api/adoption/batches?limit=${args.limit}`),
    },
  );
}

export function useAncestryTree(
  slug: string | null | undefined,
): Tree | undefined {
  return useDataQuery(api.ancestryTree.getBySlug, slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.detail("ancestry-tree", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<Tree>(
        `/api/ancestry/tree?slug=${encodeURIComponent(args.slug)}`,
      ),
  });
}

export function useAncestryHistory(limit = 20) {
  return useDataQuery(
    api.ancestryTree.list,
    { limit },
    {
      queryKey: dataQueryKeys.list("ancestry-history", { limit }),
      queryFn: (args) =>
        fetchJson<
          NonNullable<FunctionReturnType<typeof api.ancestryTree.list>>
        >(`/api/ancestry/trees?limit=${args.limit}`),
    },
  );
}

export function useAncestrySlugCheck(slug: string | null | undefined) {
  return useDataQuery(api.ancestryTree.checkSlug, slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.query("ancestry-slug", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.ancestryTree.checkSlug>>(
        `/api/ancestry/check-slug?slug=${encodeURIComponent(args.slug)}`,
      ),
  });
}

export function useCatCreate() {
  return useDataMutation(api.mapper.create, {
    mutationFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.mapper.create>>(
        "/api/cats/profile",
        { method: "POST", body: args },
      ),
  });
}
export function useCatUpdateMeta() {
  return useDataMutation(api.mapper.updateMeta, {
    mutationFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.mapper.updateMeta>>(
        "/api/cats/profile",
        { method: "PATCH", body: args },
      ),
  });
}
export function useAdoptionCreate() {
  return useDataMutation(api.adoptionV2.createBatch, {
    mutationFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.adoptionV2.createBatch>>(
        "/api/adoption/batch",
        { method: "POST", body: args },
      ),
  });
}
export function useAdoptionUpdateMeta() {
  return useDataMutation(api.adoptionV2.updateBatchMeta, {
    mutationFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.adoptionV2.updateBatchMeta>>(
        "/api/adoption/batch",
        { method: "PATCH", body: args },
      ),
  });
}

type TreeSaveArgs = FunctionArgs<typeof api.ancestryTree.save>;
export function useAncestrySave() {
  return useDataMutation(api.ancestryTree.save, {
    mutationFn: (args) =>
      fetchJson<FunctionReturnType<typeof api.ancestryTree.save>>(
        "/api/ancestry/tree",
        { method: "POST", body: { ...args, operation: "save" } },
      ),
  });
}
export function useAncestrySaveAsNew() {
  return useDataMutation(api.ancestryTree.saveAsNew, {
    mutationFn: (args: TreeSaveArgs) =>
      fetchJson<FunctionReturnType<typeof api.ancestryTree.saveAsNew>>(
        "/api/ancestry/tree",
        { method: "POST", body: { ...args, operation: "saveAsNew" } },
      ),
  });
}

export function usePaletteRecord(slug: string | null | undefined) {
  return useDataQuery(
    api.paletteGeneratorSettings.get,
    slug ? { slug } : "skip",
    {
      queryKey: dataQueryKeys.detail("palette-settings", slug ?? "none"),
      queryFn: (args) =>
        fetchJson<FunctionReturnType<typeof api.paletteGeneratorSettings.get>>(
          `/api/palette-generator-settings?slug=${encodeURIComponent(args.slug)}`,
        ),
    },
  );
}
export function usePaletteImageUrl(slug: string | null | undefined) {
  return useDataQuery(
    api.paletteGeneratorSettings.getImageUrl,
    slug ? { slug } : "skip",
    {
      queryKey: dataQueryKeys.detail("palette-image", slug ?? "none"),
      queryFn: (args) =>
        fetchJson<string | null>(
          `/api/palette-generator-settings/image?slug=${encodeURIComponent(args.slug ?? "")}`,
        ),
    },
  );
}
