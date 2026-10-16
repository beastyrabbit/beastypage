import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody, parseSearchParams } from "./request";

describe("request parsing", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses JSON and search params through zod", async () => {
    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "Mochi" }),
        }),
        schema,
      ),
    ).resolves.toEqual({ name: "Mochi" });
    expect(
      parseSearchParams(new URLSearchParams("name=Mochi"), schema),
    ).toEqual({ name: "Mochi" });
  });

  it("uses the invalid_input service error for malformed input", async () => {
    await expect(
      parseJsonBody(
        new Request("http://localhost", { method: "POST", body: "{" }),
        schema,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(() =>
      parseSearchParams(new URLSearchParams("name="), schema),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
