# Client data foundation

Browser data access uses TanStack Query hooks in `frontend/lib/data`. Each
area file builds a stable key with `dataQueryKeys` and fetches a Next.js API
route with `fetchJson`. For example, the cat hooks in
`frontend/lib/data/cats.ts` use this pattern:

```tsx
const profile = useDataQuery(slugOrId ? { slugOrId } : "skip", {
  queryKey: dataQueryKeys.detail("cat-profile", slugOrId ?? "none"),
  queryFn: (args, signal) =>
    fetchJson(
      `/api/cats/profile?slugOrId=${encodeURIComponent(args.slugOrId)}`,
      { signal, nullable: true },
    ),
});

const save = useDataMutation({
  mutationFn: (args, signal) =>
    fetchJson("/api/cats/profile", {
      method: "PATCH",
      body: args,
      signal,
    }),
  invalidate: [dataQueryKeys.detail("cat-profile", slugOrId)],
});
```

`useDataQuery` takes the arguments or `"skip"` and a
`DataQueryOptions` object. It runs a TanStack query when enabled and returns
`undefined` until the first response. `useDataMutation` returns an async
function and invalidates the keys listed in `invalidate` after success.

Use `useDataPaginatedQuery` for lists. Its fetcher receives the current opaque
cursor and returns `{ results, nextCursor }`. The hook exposes
`{ results, status, loadMore, isLoading }`. Route handlers use
`encodeCursor` and `decodeCursor` and order pages by creation time and ID.

`dataQueryKeys` provides the shared `all`, `query`, `list`, and `detail` key
builders. Keys intentionally omit a trailing `undefined` so TanStack prefix
invalidation matches the stored queries.

The `frontend/lib/data/index.ts` barrel exports the auth, hook, and key
modules for client components.

`useBackendAuth()` now reports Clerk's loading and signed-in state. It also
resets the TanStack Query cache when the Clerk user changes, preventing data
from the previous user from being shown.

`frontend/app/layout.tsx` renders `AppProviders` from
`frontend/components/providers.tsx`. The provider tree mounts `ClerkProvider`,
`QueryClientProvider`, and `BackendAuthProvider`. The query client uses a
30-second stale time, avoids refetching on window focus, and retries transient
errors. `fetchJson` sends and receives JSON and throws `ApiError` with
`status`, `code`, and `message`; pass its `signal` through for cancellation.
