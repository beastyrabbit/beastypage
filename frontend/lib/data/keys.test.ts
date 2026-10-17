import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dataQueryKeys } from "./keys";

describe("dataQueryKeys", () => {
  it("invalidates every argument variant through the argument-less key", async () => {
    const client = new QueryClient();
    const approved = dataQueryKeys.list("catdex", { approved: true });
    const pending = dataQueryKeys.list("catdex", { approved: false });
    const other = dataQueryKeys.list("collection", {});
    for (const key of [approved, pending, other]) client.setQueryData(key, []);

    await client.invalidateQueries({ queryKey: dataQueryKeys.list("catdex") });

    expect(client.getQueryState(approved)?.isInvalidated).toBe(true);
    expect(client.getQueryState(pending)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
