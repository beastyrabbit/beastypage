import { describe, expect, it } from "vitest";
import { ServiceError } from "./errors";
import { clampPageSize, decodeCursor, encodeCursor } from "./pagination";

describe("pagination helpers", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeCursor({
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      id: "00000000-0000-4000-8000-000000000001",
    });
    expect(cursor).not.toContain("{");
    expect(decodeCursor(cursor)).toEqual({
      createdAt: "2026-01-02T03:04:05.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects malformed cursors and clamps page sizes", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(ServiceError);
    expect(clampPageSize(undefined)).toBe(20);
    expect(clampPageSize("1000")).toBe(100);
    expect(clampPageSize(0)).toBe(1);
    expect(() => clampPageSize("wat")).toThrow(ServiceError);
  });
});
