"use client";

import { fetchJson } from "@/lib/api";
import {
  dataQueryKeys,
  useDataMutation,
  useDataPaginatedQuery,
  useDataQuery,
} from "@/lib/data";
import type {
  CatdexPayload,
  CollectionPayload,
  RarityPayload,
  SeasonPayload,
} from "@/server/services/catalog";

type CatdexPageArgs = { approved: boolean };
type CatdexPageResponse = {
  results: CatdexPayload[];
  nextCursor: string | null;
};
type CollectionPageResponse = {
  results: CollectionPayload[];
  nextCursor: string | null;
};

export function useCatalogSeasons() {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.list("seasons"),
      queryFn: (_args, signal) =>
        fetchJson<SeasonPayload[]>("/api/seasons", { signal }),
    },
  );
}

export function useCatalogRarities() {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.list("rarities"),
      queryFn: (_args, signal) =>
        fetchJson<RarityPayload[]>("/api/rarities", { signal }),
    },
  );
}

export function useCatalogCatdexPage(args: CatdexPageArgs) {
  return useDataPaginatedQuery(args, {
    initialNumItems: 48,
    queryKey: dataQueryKeys.list("catdex", args),
    queryFn: async (queryArgs, cursor, signal) => {
      const params = new URLSearchParams({
        approved: String(queryArgs.approved),
        pageSize: "48",
      });
      if (cursor) params.set("cursor", cursor);
      const result = await fetchJson<CatdexPageResponse>(
        `/api/catdex?${params}`,
        { signal },
      );
      return { results: result.results, nextCursor: result.nextCursor };
    },
  });
}

export function useCatalogHasPending() {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.query("catdex.hasPending"),
      queryFn: (_args, signal) =>
        fetchJson<boolean>("/api/catdex/pending", { signal }),
    },
  );
}

export function useCatalogGenerateUploadUrl() {
  return useDataMutation({
    mutationFn: async ({ clientKey }, signal) => {
      const result = await fetchJson<{ uploadUrl: string }>(
        "/api/catdex/upload-url",
        {
          method: "POST",
          body: { clientKey },
          signal,
        },
      );
      return result.uploadUrl;
    },
  });
}

export function useCatalogCreateCatdex() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<CatdexPayload>("/api/catdex", {
        method: "POST",
        body: args,
        signal,
      }),
    invalidate: [dataQueryKeys.list("catdex")],
  });
}

export function useCatalogCollectionPage() {
  return useDataPaginatedQuery(
    {},
    {
      initialNumItems: 36,
      queryKey: dataQueryKeys.list("collection"),
      queryFn: async (_args, cursor, signal) => {
        const params = new URLSearchParams({ pageSize: "36" });
        if (cursor) params.set("cursor", cursor);
        const result = await fetchJson<CollectionPageResponse>(
          `/api/collection?${params}`,
          { signal },
        );
        return { results: result.results, nextCursor: result.nextCursor };
      },
    },
  );
}

export function useCatalogSetFocus() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<any>("/api/collection", {
        method: "PATCH",
        body: args,
        signal,
      }),
    invalidate: [dataQueryKeys.list("collection")],
  });
}
