/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("indexed user lookups", () => {
  it("writes and updates the normalized search field for new users", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      subject: "new-user",
      issuer: "https://identity.example",
      nickname: "Casey_User",
    });
    await user.mutation(api.users.getOrCreateUser, {});
    await t.run((ctx) =>
      ctx.db.insert("user_search_migrations", {
        name: "usernameSearch",
        complete: true,
        updatedAt: 1,
      }),
    );
    await expect(
      user.query(api.users.searchByUsername, { prefix: "CASEY" }),
    ).resolves.toEqual([{ userId: "new-user", username: "Casey_User" }]);

    await user.mutation(api.users.updateProfile, { username: "Renamed" });
    await expect(
      user.query(api.users.searchByUsername, { prefix: "rename" }),
    ).resolves.toEqual([{ userId: "new-user", username: "Renamed" }]);
  });

  it("fails closed until the bounded username backfill completes", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      subject: "viewer",
      issuer: "https://identity.example",
    });
    await t.run((ctx) =>
      ctx.db.insert("users", {
        tokenIdentifier: "https://identity.example|legacy",
        username: "Legacy_Name",
        showProfilePic: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      user.query(api.users.searchByUsername, { prefix: "legacy" }),
    ).rejects.toThrow("migration is incomplete");

    await t.mutation(internal.users.backfillUsernameSearch, {
      batchSize: 100,
    });
    await expect(
      user.query(api.users.searchByUsername, { prefix: "LEG" }),
    ).resolves.toEqual([{ userId: "legacy", username: "Legacy_Name" }]);
  });

  it("resolves exact Clerk IDs through the token index without scanning users", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      subject: "viewer",
      issuer: "https://identity.example",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: "https://identity.example|target",
        username: "Target",
        showProfilePic: true,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        tokenIdentifier: "https://other.example|target",
        username: "Other issuer",
        showProfilePic: true,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      user.query(api.users.resolveUsernames, { userIds: ["target"] }),
    ).resolves.toEqual([{ userId: "target", username: "Target" }]);
  });

  it("rejects oversized or malformed Clerk ID lists", async () => {
    const t = convexTest(schema, modules).withIdentity({
      subject: "viewer",
      issuer: "https://identity.example",
    });
    await expect(
      t.query(api.users.resolveUsernames, { userIds: ["a".repeat(129)] }),
    ).rejects.toThrow("Invalid Clerk user ID");
    await expect(
      t.query(api.users.resolveUsernames, {
        userIds: Array.from({ length: 101 }, (_, index) => `user_${index}`),
      }),
    ).rejects.toThrow("at most 100");
  });
});
