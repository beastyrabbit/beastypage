import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatState } from "../stream-control/obs/spinSupport";
import { buildCatShareUrl, ensureLegacyShareEncoding } from "./shareUrl";

function setup(overrides: Partial<CatState> = {}) {
  const initial: CatState = {
    params: { spriteNumber: 8, peltName: "Tabby", colour: "GINGER" },
    accessorySlots: [],
    scarSlots: [],
    tortieSlots: [],
    counts: { accessories: 0, scars: 0, tortie: 0 },
    ...overrides,
  };
  const stateRef: { current: CatState | null } = { current: initial };
  const services = {
    encode: vi.fn(() => "portable-cat"),
    createMapper: vi
      .fn<Parameters<typeof buildCatShareUrl>[1]["createMapper"]>()
      .mockResolvedValue(null),
    createShare: vi
      .fn<Parameters<typeof buildCatShareUrl>[1]["createShare"]>()
      .mockResolvedValue({ slug: "share-slug" }),
  };
  const setLink = vi.fn();
  const setError = vi.fn();
  return {
    initial,
    stateRef,
    services,
    setLink,
    setError,
    build: () => buildCatShareUrl(stateRef, services, setLink, setError),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("shared cat share URLs", () => {
  it("reuses a cached URL without encoding or persisting", async () => {
    const t = setup({ shareUrl: "https://example.com/view/existing" });
    expect(await t.build()).toBe(t.initial.shareUrl);
    expect(t.services.encode).not.toHaveBeenCalled();
    expect(t.services.createMapper).not.toHaveBeenCalled();
    expect(t.services.createShare).not.toHaveBeenCalled();
    expect(t.setLink).not.toHaveBeenCalled();
  });

  it("prefers an existing mapper slug over the profile ID", async () => {
    const t = setup({ mapperSlug: "capability", profileId: "profile-id" });
    expect(await t.build()).toBe(`${window.location.origin}/view/capability`);
    expect(t.services.createMapper).not.toHaveBeenCalled();
    expect(t.services.createShare).not.toHaveBeenCalled();
  });

  it("uses the mapper share token and keeps an existing edit capability", async () => {
    const t = setup({
      catName: "Moss",
      editToken: "existing-edit",
      catShareSlug: "old-share",
    });
    t.services.createMapper.mockResolvedValue({
      id: "profile-id",
      slug: "slug",
      shareToken: "public-token",
    });
    expect(await t.build()).toBe(`${window.location.origin}/view/public-token`);
    expect(t.stateRef.current).toMatchObject({
      profileId: "profile-id",
      mapperSlug: "public-token",
      editToken: "existing-edit",
      legacyEncoded: "portable-cat",
      catShareSlug: "old-share",
    });
    expect(t.services.createMapper).toHaveBeenCalledWith(
      expect.objectContaining({ catName: "Moss" }),
    );
    expect(t.services.createShare).not.toHaveBeenCalled();
  });

  it("falls back after mapper rejection and preserves state changed during share creation", async () => {
    const t = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    t.services.createMapper.mockRejectedValue(new Error("mapper unavailable"));
    t.services.createShare.mockImplementation(async () => {
      t.stateRef.current = {
        ...t.initial,
        catName: "Renamed",
        legacyEncoded: "new-encoding",
      };
      return { slug: "created-share" };
    });
    expect(await t.build()).toBe(
      `${window.location.origin}/visual-builder?share=created-share`,
    );
    expect(t.stateRef.current).toMatchObject({
      catName: "Renamed",
      legacyEncoded: "new-encoding",
      catShareSlug: "created-share",
    });
    expect(t.setError).not.toHaveBeenCalled();
  });

  it("uses an existing share without creating another record", async () => {
    const t = setup({ catShareSlug: "saved-share" });
    expect(await t.build()).toBe(
      `${window.location.origin}/visual-builder?share=saved-share`,
    );
    expect(t.services.createShare).not.toHaveBeenCalled();
  });

  it("keeps the original state snapshot for a legacy fallback", async () => {
    const t = setup({ legacyEncoded: "saved-encoding", catName: "Original" });
    t.services.createShare.mockImplementation(async () => {
      t.stateRef.current = { ...t.initial, catName: "Newer" };
      return null;
    });
    expect(await t.build()).toBe(
      `${window.location.origin}/view?cat=saved-encoding`,
    );
    expect(t.stateRef.current?.catName).toBe("Original");
    expect(t.services.encode).not.toHaveBeenCalled();
  });

  it("preserves the overlay's empty stub encoding and reports no available link", async () => {
    const t = setup();
    t.services.encode.mockReturnValue("");
    t.services.createShare.mockResolvedValue({ slug: "" });
    expect(await t.build()).toBeNull();
    expect(t.setError).toHaveBeenCalledWith(
      "Unable to build share link right now.",
    );
    expect(t.setLink).not.toHaveBeenCalled();
  });

  it("propagates share storage failures instead of silently using the legacy URL", async () => {
    const t = setup();
    const failure = new Error("share unavailable");
    t.services.createShare.mockRejectedValue(failure);
    await expect(t.build()).rejects.toBe(failure);
    expect(t.setLink).not.toHaveBeenCalled();
    expect(t.setError).not.toHaveBeenCalled();
  });

  it("does not resurrect a cleared state when the share request completes", async () => {
    const t = setup();
    t.services.createShare.mockImplementation(async () => {
      t.stateRef.current = null;
      return { slug: "created-share" };
    });
    expect(await t.build()).toBe(
      `${window.location.origin}/visual-builder?share=created-share`,
    );
    expect(t.stateRef.current).toBeNull();
  });

  it("returns the previous empty encoding when encoding throws", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const encode = vi.fn(() => {
      throw new Error("cannot encode");
    });
    const t = setup();
    const payload = { ...t.initial, counts: { ...t.initial.counts } };
    expect(ensureLegacyShareEncoding("", payload, encode)).toBe("");
    expect(ensureLegacyShareEncoding(undefined, payload, encode)).toBeNull();
  });
});
