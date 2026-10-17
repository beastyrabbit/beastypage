import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DEFAULT_JSON_BODY_BYTES,
  parseJsonBody,
  parseSearchParams,
} from "./request";

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

  it("limits the body and reads an empty body as the given default", async () => {
    const optional = z.object({ name: z.string().optional() });
    await expect(
      parseJsonBody(
        new Request("http://localhost", { method: "POST" }),
        optional,
        { maxBytes: 64, emptyBody: {} },
      ),
    ).resolves.toEqual({});
    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "x".repeat(100) }),
        }),
        optional,
        { maxBytes: 64 },
      ),
    ).rejects.toMatchObject({ code: "payload_too_large", status: 413 });
    await expect(
      parseJsonBody(
        new Request("http://localhost", { method: "POST" }),
        optional,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "x".repeat(DEFAULT_JSON_BODY_BYTES) }),
        }),
        optional,
      ),
    ).rejects.toMatchObject({ code: "payload_too_large" });
  });
});
