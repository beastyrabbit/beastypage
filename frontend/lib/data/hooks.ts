"use client";

import {
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
  useMutation as useTanStackMutation,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import {
  type PaginatedQueryReference,
  type UsePaginatedQueryResult,
  useMutation as useConvexMutation,
  usePaginatedQuery as useConvexPaginatedQuery,
  useQuery as useConvexQuery,
} from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { useCallback } from "react";
import { useDataBackend } from "./backend";

export type DataQueryOptions<TArgs, TData> = {
  queryKey: QueryKey;
  queryFn?: (args: TArgs, signal: AbortSignal) => Promise<TData>;
  enabled?: boolean;
};

export function useDataQuery<
  Query extends FunctionReference<"query">,
  TData = FunctionReturnType<Query>,
>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
  options: DataQueryOptions<FunctionArgs<Query>, TData>,
): TData | undefined {
  const backend = useDataBackend();
  const convexResult = useConvexQuery(
    query as never,
    (backend === "convex" ? args : "skip") as never,
  ) as TData | undefined;
  const postgresResult = useTanStackQuery({
    queryKey: options.queryKey,
    queryFn: ({ signal }) => {
      if (!options.queryFn) {
        throw new Error("A PostgreSQL queryFn is required for useDataQuery");
      }
      return options.queryFn(args as FunctionArgs<Query>, signal);
    },
    enabled:
      backend === "postgres" && args !== "skip" && options.enabled !== false,
  });

  if (backend === "postgres" && postgresResult.error) {
    throw postgresResult.error;
  }
  return backend === "convex" ? convexResult : postgresResult.data;
}

export type DataMutationOptions<TArgs, TResult> = {
  mutationFn?: (args: TArgs, signal: AbortSignal) => Promise<TResult>;
  invalidate?: QueryKey[];
};

export function useDataMutation<
  Mutation extends FunctionReference<"mutation">,
  TResult = FunctionReturnType<Mutation>,
>(
  mutation: Mutation,
  options: DataMutationOptions<FunctionArgs<Mutation>, TResult> = {},
): (args: FunctionArgs<Mutation>) => Promise<TResult> {
  const backend = useDataBackend();
  const client = useQueryClient();
  const convexMutation = useConvexMutation(mutation);
  // `mutateAsync` is stable; the mutation result object is not, and callers
  // put this function in effect dependencies like Convex's stable mutation.
  const { mutateAsync } = useTanStackMutation({
    mutationFn: ({
      args,
      signal,
    }: {
      args: FunctionArgs<Mutation>;
      signal?: AbortSignal;
    }) => {
      if (!options.mutationFn) {
        throw new Error(
          "A PostgreSQL mutationFn is required for useDataMutation",
        );
      }
      return options.mutationFn(args, signal ?? new AbortController().signal);
    },
    onSuccess: async () => {
      await invalidateDataQueries(client, options.invalidate ?? []);
    },
  });

  return useCallback(
    async (args: FunctionArgs<Mutation>) => {
      if (backend === "convex") {
        return (await convexMutation(args as never)) as TResult;
      }
      return mutateAsync({ args });
    },
    [backend, convexMutation, mutateAsync],
  );
}

export type DataPage<T> = {
  results: T[];
  nextCursor?: string | null;
};

export type DataPaginatedOptions<TArgs, TItem> = {
  queryKey: QueryKey;
  initialNumItems: number;
  queryFn?: (
    args: TArgs,
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<DataPage<TItem>>;
  enabled?: boolean;
};

export function useDataPaginatedQuery<
  Query extends PaginatedQueryReference,
  TItem = FunctionReturnType<Query>["page"][number],
>(
  query: Query,
  args: Omit<FunctionArgs<Query>, "paginationOpts"> | "skip",
  options: DataPaginatedOptions<
    Omit<FunctionArgs<Query>, "paginationOpts">,
    TItem
  >,
): UsePaginatedQueryResult<TItem> {
  const backend = useDataBackend();
  const convexResult = useConvexPaginatedQuery(
    query,
    backend === "convex" ? (args as never) : "skip",
    { initialNumItems: options.initialNumItems },
  ) as UsePaginatedQueryResult<TItem>;
  const postgresResult = useInfiniteQuery({
    queryKey: options.queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!options.queryFn) {
        throw new Error(
          "A PostgreSQL queryFn is required for useDataPaginatedQuery",
        );
      }
      return options.queryFn(
        args as Omit<FunctionArgs<Query>, "paginationOpts">,
        pageParam,
        signal,
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      backend === "postgres" && args !== "skip" && options.enabled !== false,
  });

  if (backend === "convex") return convexResult;
  if (postgresResult.error) throw postgresResult.error;
  const pages = postgresResult.data?.pages ?? [];
  const results = pages.flatMap((page) => page.results);
  const isLoading =
    postgresResult.isPending || postgresResult.isFetchingNextPage;
  const status = postgresResult.isPending
    ? "LoadingFirstPage"
    : postgresResult.isFetchingNextPage
      ? "LoadingMore"
      : postgresResult.hasNextPage
        ? "CanLoadMore"
        : "Exhausted";
  return {
    results,
    status,
    isLoading,
    loadMore: () => {
      if (postgresResult.hasNextPage && !postgresResult.isFetchingNextPage) {
        void postgresResult.fetchNextPage();
      }
    },
  } as UsePaginatedQueryResult<TItem>;
}

export async function invalidateDataQueries(
  client: ReturnType<typeof useQueryClient>,
  keys: QueryKey[],
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

export function useInvalidateDataQueries() {
  const client = useQueryClient();
  return useCallback(
    (keys: QueryKey[]) => invalidateDataQueries(client, keys),
    [client],
  );
}
