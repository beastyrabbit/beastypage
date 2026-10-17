import { describe, expect, it } from "vitest";
import { jobKindRegistry } from ".";
import { FILE_REFERENCE_COLUMNS } from "./files-orphan-cleanup";

describe("catalog jobs", () => {
  it("registers every catalog and file job", () => {
    expect([...jobKindRegistry.keys()]).toEqual(
      expect.arrayContaining([
        "catdex.thumbnail",
        "catdex.thumbnail-backfill",
        "catdex.upload-retention",
        "files.orphan-cleanup",
      ]),
    );
  });

  it("keeps the complete schema file reference inventory", () => {
    expect(FILE_REFERENCE_COLUMNS).toEqual(
      expect.arrayContaining([
        ["card_season", "card_back_file_id"],
        ["catdex", "default_card_file_id"],
        ["catdex", "default_card_thumb_file_id"],
        ["catdex", "custom_card_file_id"],
        ["catdex", "custom_card_thumb_file_id"],
        ["catdex_uploads", "file_id"],
        ["collection", "blur_img_file_id"],
        ["collection", "preview_img_file_id"],
        ["collection", "full_img_file_id"],
        ["cat_images", "file_id"],
        ["palette_generator_settings", "image_file_id"],
      ]),
    );
  });
});
