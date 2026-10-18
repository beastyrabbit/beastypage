"use client";

import {
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
  useMutation as useTanStackMutation,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import { useCallback } from "react";
export type UsePaginatedQueryResult<T> = {
  results: T[];
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  isLoading: boolean;
  loadMore: (_count?: number) => void;
};

export type DataQueryOptions<TArgs, TData> = {
  queryKey: QueryKey;
  queryFn?: (args: TArgs, signal: AbortSignal) => Promise<TData>;
  enabled?: boolean;
};

export function useDataQuery<TArgs = any, TData = any>(
  args: TArgs | "skip",
  options: DataQueryOptions<TArgs, TData>,
): TData | undefined {
  const postgresResult = useTanStackQuery({
    queryKey: options.queryKey,
    queryFn: ({ signal }) => {
      if (!options.queryFn) {
        throw new Error("A PostgreSQL queryFn is required for useDataQuery");
      }
      return options.queryFn(args as TArgs, signal);
    },
    enabled: args !== "skip" && options.enabled !== false,
  });

  if (postgresResult.error) throw postgresResult.error;
  return postgresResult.data;
}

export type DataMutationOptions<TArgs, TResult> = {
  mutationFn?: (args: TArgs, signal: AbortSignal) => Promise<TResult>;
  invalidate?: QueryKey[];
};

export function useDataMutation<TArgs = any, TResult = any>(
  options: DataMutationOptions<TArgs, TResult> = {},
): (args: TArgs) => Promise<TResult> {
  const client = useQueryClient();
  // `mutateAsync` is stable; the mutation result object is not, and callers
  // put this function in effect dependencies like PostgreSQL's stable mutation.
  const { mutateAsync } = useTanStackMutation({
    mutationFn: ({ args, signal }: { args: TArgs; signal?: AbortSignal }) => {
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
    async (args: TArgs) => mutateAsync({ args }),
    [mutateAsync],
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

export function useDataPaginatedQuery<TArgs = any, TItem = any>(
  args: TArgs | "skip",
  options: DataPaginatedOptions<TArgs, TItem>,
): UsePaginatedQueryResult<TItem> {
  const postgresResult = useInfiniteQuery({
    queryKey: options.queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!options.queryFn) {
        throw new Error(
          "A PostgreSQL queryFn is required for useDataPaginatedQuery",
        );
      }
      return options.queryFn(args as TArgs, pageParam, signal);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: args !== "skip" && options.enabled !== false,
  });

  if (postgresResult.error) throw postgresResult.error;
  const pages = postgresResult.data?.pages ?? [];
  const results = pages.flatMap((page) => page.results);
  const isLoading =
    postgresResult.isPending || postgresResult.isFetchingNextPage;
  let status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  if (postgresResult.isPending) status = "LoadingFirstPage";
  else if (postgresResult.isFetchingNextPage) status = "LoadingMore";
  else if (postgresResult.hasNextPage) status = "CanLoadMore";
  else status = "Exhausted";
  return {
    results,
    status,
    isLoading,
    loadMore: () => {
      if (postgresResult.hasNextPage && !postgresResult.isFetchingNextPage) {
        void postgresResult.fetchNextPage();
      }
    },
  };
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
