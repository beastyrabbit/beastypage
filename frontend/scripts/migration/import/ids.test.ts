// @vitest-environment node
import { describe, expect, it } from "vitest";
import { freezeFromArchiveName } from "../import-convex";
import { importedId, uuidv5 } from "./ids";

describe("import ids", () => {
  it("implements RFC 4122 version 5", () => {
    // Python: uuid.uuid5(uuid.NAMESPACE_DNS, "www.example.com")
    expect(
      uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("is deterministic and scoped by table", () => {
    const id = "j57a1b2c3d4e5f6g7h8j9k0m1n2p3q4r";
    expect(importedId("cat_profile", id)).toBe(importedId("cat_profile", id));
    expect(importedId("cat_profile", id)).not.toBe(importedId("users", id));
  });

  it("reads the freeze time from Convex snapshot names", () => {
    expect(
      freezeFromArchiveName(
        "/private/snapshot_1760529600123456789.zip",
      )?.toISOString(),
    ).toBe("2025-10-15T12:00:00.123Z");
    expect(
      freezeFromArchiveName(
        "/private/snapshot_happy-otter-123_1760529600123456789.zip",
      )?.toISOString(),
    ).toBe("2025-10-15T12:00:00.123Z");
    expect(freezeFromArchiveName("/private/export.zip")).toBeNull();
  });
});
