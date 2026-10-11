/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const treeData = {
  slug: "legacy-copy",
  name: "Legacy copy",
  foundingMotherId: "mother",
  foundingFatherId: "father",
  cats: [],
  config: { minChildren: 1, maxChildren: 2, depth: 1, genderRatio: 0.5 },
};

describe("legacy ancestry tree migration", () => {
  it("saves a legacy tree as a new independently editable tree", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("ancestry_tree", {
        ...treeData,
        slug: "legacy-read-only",
        name: "Legacy read-only",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      t.mutation(api.ancestryTree.save, {
        ...treeData,
        slug: "legacy-read-only",
      }),
    ).resolves.toEqual({ success: false, error: "edit_token_required" });

    const result = await t.mutation(api.ancestryTree.saveAsNew, treeData);
    expect(result).toMatchObject({
      success: true,
      slug: "legacy-copy",
      isNew: true,
    });
    expect(result).toHaveProperty("editToken");

    const copy = await t.query(api.ancestryTree.getBySlug, {
      slug: "legacy-copy",
    });
    expect(copy).toMatchObject({ name: "Legacy copy", hasPassword: false });

    const update = await t.mutation(api.ancestryTree.save, {
      ...treeData,
      name: "Updated copy",
      editToken: result.editToken,
    });
    expect(update).toMatchObject({ success: true, isNew: false });
  });

  it("never overwrites an existing slug in the copy path", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("ancestry_tree", {
        ...treeData,
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      t.mutation(api.ancestryTree.saveAsNew, treeData),
    ).resolves.toEqual({ success: false, error: "slug_taken" });
    await expect(
      t.query(api.ancestryTree.getBySlug, { slug: treeData.slug }),
    ).resolves.toMatchObject({ name: treeData.name });
  });

  it("rejects route-unsafe slugs on both save paths", async () => {
    const t = convexTest(schema, modules);
    const invalid = { ...treeData, slug: "not/a-valid-slug" };

    await expect(t.mutation(api.ancestryTree.save, invalid)).rejects.toThrow(
      "Invalid tree slug",
    );
    await expect(
      t.mutation(api.ancestryTree.saveAsNew, invalid),
    ).rejects.toThrow("Invalid tree slug");
  });
});
