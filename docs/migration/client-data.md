# Client data foundation

The client keeps the Convex API shape while each migrated area gains a
PostgreSQL route. `DATA_BACKEND` is read on the server in the root layout and
provided to client components through `DataBackendProvider`. Components use
`useDataBackend()` only when they need to render backend-specific details;
data access should use the dual-path hooks.

```tsx
const settings = useDataQuery(api.dashSettings.get, { slug }, {
  queryKey: dataQueryKeys.detail("dash-settings", slug),
  queryFn: (args, signal) =>
    fetchJson(`/api/dash-settings?slug=${encodeURIComponent(args.slug)}`, {
      signal,
    }),
});

const save = useDataMutation(api.dashSettings.save, {
  mutationFn: (args, signal) =>
    fetchJson("/api/dash-settings", { method: "POST", body: args, signal }),
  invalidate: [dataQueryKeys.detail("dash-settings", slug)],
});
```

`useDataQuery` always calls both underlying hooks so the Rules of Hooks remain
valid. The Convex hook receives `"skip"` while PostgreSQL is selected; the
TanStack query is disabled while Convex is selected. Query results are
`undefined` until the first response, matching Convex. Mutations return the
same async function shape as `useMutation` and invalidate the keys listed in
`invalidate` after a PostgreSQL success.

Use `useDataPaginatedQuery` for lists. Its PostgreSQL fetcher receives the
current opaque cursor and returns `{ results, nextCursor }`; the hook exposes
Convex's `{ results, status, loadMore, isLoading }` contract. Route handlers
should use `encodeCursor`/`decodeCursor` and order by `(created_at, id)`.

`fetchJson` sends and receives JSON and throws `ApiError` with `status`, `code`
and `message` for the server error contract. Pass its `signal` through to
support cancellation when TanStack Query abandons a request.
