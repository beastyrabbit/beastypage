import { describe, expect, it, vi } from "vitest";
import {
  clipboardImageFile,
  imageFromPaste,
  imageFromPastedMarkup,
  readClipboardImage,
} from "./quick-share-clipboard";

const NOW = Date.UTC(2026, 6, 23, 13, 15, 0);

describe("quick share clipboard images", () => {
  it("turns a pasted image into a consistently named file", () => {
    const source = new File(["image"], "pasted.png", { type: "image/png" });
    const result = imageFromPaste(
      {
        files: [source] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
      },
      NOW,
    );

    expect(result).not.toBeNull();
    expect(result?.name).toBe("clipboard-2026-07-23T131500Z.png");
    expect(result?.type).toBe("image/png");
    expect(result?.size).toBe(source.size);
  });

  it("falls back to clipboard items when the files list is empty", () => {
    const source = new File(["jpeg"], "image.jpg", { type: "image/jpeg" });
    const getAsFile = vi.fn(() => source);
    const result = imageFromPaste(
      {
        files: [] as unknown as FileList,
        items: [
          { kind: "file", type: "image/jpeg", getAsFile },
        ] as unknown as DataTransferItemList,
      },
      NOW,
    );

    expect(result?.name).toBe("clipboard-2026-07-23T131500Z.jpg");
    expect(getAsFile).toHaveBeenCalledOnce();
  });

  it("reads the first image from the async Clipboard API", async () => {
    const getType = vi.fn(
      async () => new Blob(["webp"], { type: "image/webp" }),
    );
    const result = await readClipboardImage(
      {
        read: vi.fn(async () => [
          { types: ["text/plain"], getType },
          { types: ["image/webp"], getType },
        ]),
      },
      NOW,
    );

    expect(result?.name).toBe("clipboard-2026-07-23T131500Z.webp");
    expect(result?.type).toBe("image/webp");
    expect(getType).toHaveBeenCalledWith("image/webp");
  });

  it("extracts WebKit's pasted image blob from editable markup", async () => {
    const root = document.createElement("div");
    const image = document.createElement("img");
    image.src = "blob:https://example.com/clipboard-image";
    root.append(image);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json("png", {
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    const result = await imageFromPastedMarkup(root, NOW);

    expect(result?.name).toBe("clipboard-2026-07-23T131500Z.png");
    expect(result?.type).toBe("image/png");
  });

  it("rejects empty and non-image clipboard content", async () => {
    expect(
      clipboardImageFile(new Blob([], { type: "image/png" }), "image/png", NOW),
    ).toBeNull();
    expect(
      await readClipboardImage(
        {
          read: vi.fn(async () => [
            {
              types: ["text/plain"],
              getType: vi.fn(async () => new Blob(["text"])),
            },
          ]),
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      await imageFromPastedMarkup(document.createElement("div"), NOW),
    ).toBeNull();
  });
});
