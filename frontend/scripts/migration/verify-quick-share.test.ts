// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { HeadResult } from "./s3-head";
import { checkUpload, type UploadRow } from "./verify-quick-share";

const row = (patch: Partial<UploadRow>): UploadRow => ({
  slug: "s",
  state: "ready",
  original_key: "originals/a",
  original_size: 100,
  public_key: "derivatives/a.webp",
  public_size: 80,
  public_mime: "image/webp",
  ...patch,
});

const store =
  (objects: Record<string, HeadResult>) =>
  async (key: string): Promise<HeadResult> =>
    objects[key] ?? { status: 404, size: null, contentType: null };

const ok = (
  size: number,
  contentType = "application/octet-stream",
): HeadResult => ({
  status: 200,
  size,
  contentType,
});

describe("Quick Share S3 verification", () => {
  it("accepts matching ready uploads", async () => {
    const head = store({
      "originals/a": ok(100),
      "derivatives/a.webp": ok(80, "image/webp"),
    });
    expect(await checkUpload(row({}), head)).toEqual([]);
  });

  it("reports missing and mismatched objects", async () => {
    const head = store({
      "originals/a": ok(99),
      "derivatives/a.webp": ok(80, "image/png"),
    });
    expect(await checkUpload(row({}), head)).toEqual([
      "original size 99 != 100",
      "public type image/png != image/webp",
    ]);
    expect(await checkUpload(row({ state: "failed" }), store({}))).toEqual([
      "original missing (HTTP 404)",
    ]);
  });

  it("skips in-flight uploads and tolerates pending deletes", async () => {
    expect(await checkUpload(row({ state: "uploading" }), store({}))).toEqual(
      [],
    );
    expect(await checkUpload(row({ state: "removed" }), store({}))).toEqual([]);
    expect(
      await checkUpload(
        row({ state: "removed" }),
        store({ "originals/a": ok(100) }),
      ),
    ).toEqual(["info: original still present (delete job pending)"]);
  });
});
