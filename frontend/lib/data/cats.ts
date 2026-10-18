"use client";

import { fetchJson } from "@/lib/api";
import type {
  createBatch,
  getBatch,
  listBatches,
  updateBatchMeta,
} from "@/server/services/adoption";
import type {
  getBySlug,
  listTrees,
  saveTree,
} from "@/server/services/ancestry";
import type {
  createProfile,
  getProfile,
  listHistory,
  updateProfileMeta,
} from "@/server/services/cats";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
type Batch = NonNullable<Awaited<ReturnType<typeof getBatch>>>;
type Tree = NonNullable<Awaited<ReturnType<typeof getBySlug>>>;
type CatHistory = Awaited<ReturnType<typeof listHistory>>;
type AdoptionHistory = Awaited<ReturnType<typeof listBatches>>;
type AncestryHistory = Awaited<ReturnType<typeof listTrees>>;
type CatCreateArgs = Parameters<typeof createProfile>[1];
type CatCreateResult = Awaited<ReturnType<typeof createProfile>>;
type AdoptionCreateArgs = Parameters<typeof createBatch>[1];
type AdoptionCreateResult = Awaited<ReturnType<typeof createBatch>>;
type TreeSaveArgs = Parameters<typeof saveTree>[1];
type TreeSaveResult = Awaited<ReturnType<typeof saveTree>>;
type SlugCheck = { exists: boolean; hasPassword: boolean };
type PaletteRecord = {
  slug: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
};

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
        fetchJson<CatHistory>(`/api/cats/history?limit=${args.limit}`),
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
        fetchJson<AdoptionHistory>(`/api/adoption/batches?limit=${args.limit}`),
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
        fetchJson<AncestryHistory>(`/api/ancestry/trees?limit=${args.limit}`),
    },
  );
}

export function useAncestrySlugCheck(slug: string | null | undefined) {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.query("ancestry-slug", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<SlugCheck>(
        `/api/ancestry/check-slug?slug=${encodeURIComponent(args.slug)}`,
      ),
  });
}

export function useCatCreate() {
  return useDataMutation<CatCreateArgs, CatCreateResult>({
    mutationFn: (args) =>
      fetchJson<CatCreateResult>("/api/cats/profile", {
        method: "POST",
        body: args,
      }),
  });
}
export function useCatUpdateMeta() {
  return useDataMutation<Parameters<typeof updateProfileMeta>[1], Profile>({
    mutationFn: (args) =>
      fetchJson<Profile>("/api/cats/profile", { method: "PATCH", body: args }),
  });
}
export function useAdoptionCreate() {
  return useDataMutation<AdoptionCreateArgs, AdoptionCreateResult>({
    mutationFn: (args) =>
      fetchJson<AdoptionCreateResult>("/api/adoption/batch", {
        method: "POST",
        body: args,
      }),
  });
}
export function useAdoptionUpdateMeta() {
  return useDataMutation<Parameters<typeof updateBatchMeta>[1], Batch>({
    mutationFn: (args) =>
      fetchJson<Batch>("/api/adoption/batch", { method: "PATCH", body: args }),
  });
}

export function useAncestrySave() {
  return useDataMutation<TreeSaveArgs, TreeSaveResult>({
    mutationFn: (args) =>
      fetchJson<TreeSaveResult>("/api/ancestry/tree", {
        method: "POST",
        body: { ...args, operation: "save" },
      }),
  });
}
export function useAncestrySaveAsNew() {
  return useDataMutation<TreeSaveArgs, TreeSaveResult>({
    mutationFn: (args: TreeSaveArgs) =>
      fetchJson<TreeSaveResult>("/api/ancestry/tree", {
        method: "POST",
        body: { ...args, operation: "saveAsNew" },
      }),
  });
}

export function usePaletteRecord(slug: string | null | undefined) {
  return useDataQuery(slug ? { slug } : "skip", {
    queryKey: dataQueryKeys.detail("palette-settings", slug ?? "none"),
    queryFn: (args) =>
      fetchJson<PaletteRecord>(
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
