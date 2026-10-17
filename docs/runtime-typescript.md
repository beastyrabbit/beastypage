# Runtime TypeScript services

The media and image-processing containers start TypeScript directly with Node's strip-only loader:

```text
node --experimental-strip-types src/index.ts
```

Strip-only mode removes type syntax but does not transform TypeScript features that change runtime JavaScript. Do not use constructor parameter properties, enums, namespaces, or decorators in either service. A file can pass `tsc`, Biome, and Vitest and still prevent a pod from starting.

The media service has a regression test at `backend/media_service/test/stripTypes.test.ts`. It applies Node's `stripTypeScriptTypes(..., { mode: "strip" })` to every source file. Keep this test (or an equivalent check) when adding another service that runs TypeScript directly.

For a focused local check, run the service's own command rather than `node --check`; check mode does not exercise stripping:

```bash
pnpm --dir backend/media_service run test
pnpm --dir backend/media_service run lint
pnpm --dir backend/image_processing_service run typecheck
node --experimental-strip-types backend/media_service/src/index.ts
```
