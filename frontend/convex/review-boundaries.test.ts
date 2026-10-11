/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

describe("anonymous capability ownership", () => {
  it("does not treat two missing identities as the same owner", async () => {
    const t = convexTest(schema, modules);
    const cases = [
      {
        slug: "sharefixture",
        create: () =>
          t.mutation(api.catShares.create, {
            slug: "sharefixture",
            data: { params: {} },
          }),
        update: () =>
          t.mutation(api.catShares.create, {
            slug: "sharefixture",
            data: { params: { changed: true } },
          }),
      },
      {
        slug: "dashfixture",
        create: () =>
          t.mutation(api.dashSettings.save, {
            slug: "dashfixture",
            config: { value: 1 },
          }),
        update: () =>
          t.mutation(api.dashSettings.save, {
            slug: "dashfixture",
            config: { value: 2 },
          }),
      },
      {
        slug: "palettefixture",
        create: () =>
          t.mutation(api.paletteGeneratorSettings.save, {
            slug: "palettefixture",
            config: { value: 1 },
          }),
        update: () =>
          t.mutation(api.paletteGeneratorSettings.save, {
            slug: "palettefixture",
            config: { value: 2 },
          }),
      },
      {
        slug: "pixelatorfixture",
        create: () =>
          t.mutation(api.pixelatorSettings.save, {
            slug: "pixelatorfixture",
            config: { value: 1 },
          }),
        update: () =>
          t.mutation(api.pixelatorSettings.save, {
            slug: "pixelatorfixture",
            config: { value: 2 },
          }),
      },
      {
        slug: "singlecatfixture",
        create: () =>
          t.mutation(api.singleCatSettings.save, {
            slug: "singlecatfixture",
            config: { value: 1 },
          }),
        update: () =>
          t.mutation(api.singleCatSettings.save, {
            slug: "singlecatfixture",
            config: { value: 2 },
          }),
      },
    ];

    for (const entry of cases) {
      await entry.create();
      await expect(entry.update()).rejects.toThrow(/Not authorized/);
    }
  });

  it("requires the mapper edit token for anonymous metadata updates", async () => {
    const t = convexTest(schema, modules);
    const profile = await t.mutation(api.mapper.create, {
      catData: { mode: "wizard-timeline", params: {} },
    });
    const id = profile.id as Id<"cat_profile">;
    const publicProfile = await t.query(api.mapper.getBySlug, {
      slugOrId: profile.slug,
    });
    expect(JSON.stringify(publicProfile)).not.toContain(profile.editToken);

    await expect(
      t.mutation(api.mapper.updateMeta, {
        id,
        catName: "Blocked",
      }),
    ).rejects.toThrow("Not authorized");

    const updated = await t.mutation(api.mapper.updateMeta, {
      id,
      catName: "Named",
      creatorName: "Creator",
      editToken: profile.editToken,
    });
    expect(updated).toMatchObject({
      id: profile.id,
      catName: "Named",
      creatorName: "Creator",
    });
    expect(JSON.stringify(updated)).not.toContain(profile.editToken);
  });
});

describe("adoption authority", () => {
  it("keeps editor capabilities private and requires them to attach profiles and edit batches", async () => {
    const t = convexTest(schema, modules);
    const profile = await t.mutation(api.mapper.create, {
      catData: { params: {} },
    });
    const cat = {
      label: "Fixture",
      catData: {},
      profileId: profile.id as Id<"cat_profile">,
    };
    await expect(
      t.mutation(api.adoptionV2.createBatch, { cats: [cat] }),
    ).rejects.toThrow("Not authorized");
    const batch = await t.mutation(api.adoptionV2.createBatch, {
      cats: [{ ...cat, editToken: profile.editToken! }],
    });
    for (const result of [
      await t.query(api.adoptionV2.getBySlug, { slugOrId: batch.slug }),
      ...(await t.query(api.adoptionV2.listBatches, {})),
    ]) {
      expect(JSON.stringify(result)).not.toContain(profile.editToken);
      expect(JSON.stringify(result)).not.toContain(batch.editToken);
      expect(result?.cats[0]).not.toHaveProperty("editToken");
    }
    await expect(
      t.mutation(api.adoptionV2.updateBatchMeta, {
        id: batch.id as Id<"adoption_batch">,
        title: "Changed",
      }),
    ).rejects.toThrow("Not authorized");
    await t.mutation(api.adoptionV2.updateBatchMeta, {
      id: batch.id as Id<"adoption_batch">,
      editToken: batch.editToken,
      title: "Changed",
    });
    expect(
      (await t.query(api.adoptionV2.getBySlug, { slugOrId: batch.slug }))
        ?.title,
    ).toBe("Changed");
  });
});

describe("legacy voting transactions", () => {
  it("returns unavailable host selections safely for legacy, foreign, or malformed IDs", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const other = t.withIdentity({
      subject: "other",
      issuer: "https://identity.example",
    });
    const modern = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "host",
      status: "live",
    });
    const legacy = await t.run((ctx) =>
      ctx.db.insert("stream_sessions", {
        viewerKey: "legacy",
        status: "live",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    expect(
      await host.query(api.streamSessionsV2.getForHost, { id: modern!.id }),
    ).toMatchObject({ id: modern!.id });
    expect(
      await other.query(api.streamSessionsV2.getForHost, { id: modern!.id }),
    ).toBeNull();
    expect(
      await host.query(api.streamSessionsV2.getForHost, { id: legacy }),
    ).toBeNull();
    expect(
      await host.query(api.streamSessionsV2.getForHost, { id: "invalid" }),
    ).toBeNull();
  });
  it("preserves only verified host presentation metadata and ignores participant spoofing", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const session = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
      allowedOptions: ["WHITE"],
      params: { _votesOpen: true },
    });
    const sessionId = session!.id as Id<"stream_sessions">;
    const vote = {
      sessionId,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
      optionMeta: {
        streamer: false,
        via: "coinFlip",
        label: "White",
        step: "Colour",
        arbitrary: "discard",
      },
    };
    await expect(t.mutation(api.streamVotesV2.create, vote)).rejects.toThrow(
      "host",
    );
    await host.mutation(api.streamVotesV2.create, vote);
    const viewerSession = crypto.randomUUID();
    const participant = await t.mutation(api.streamParticipantsV2.create, {
      sessionId,
      viewerSession,
      displayName: "Viewer",
      status: "active",
    });
    await t.mutation(api.streamVotesV2.create, {
      ...vote,
      viewerSession,
      votedBy: participant!.id as Id<"stream_participants">,
    });
    const votes = await t.query(api.streamVotesV2.list, {
      session: sessionId,
      limit: 20,
    });
    expect(votes.find((v) => !v.votedby)?.option_meta).toEqual({
      streamer: true,
      via: "coinFlip",
      label: "White",
      step: "Colour",
    });
    expect(votes.find((v) => v.votedby)?.option_meta).toEqual({
      participantId: participant!.id,
      participantName: "Viewer",
    });
  });

  it("bounds anonymous participant creation per session", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "participant-limit-host",
      issuer: "https://identity.example",
    });
    const session = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "participant-limit",
      status: "live",
      currentStep: "colour",
      allowedOptions: ["WHITE"],
    });
    const sessionId = session!.id as Id<"stream_sessions">;
    for (let index = 0; index < 500; index += 1) {
      await t.mutation(api.streamParticipantsV2.create, {
        sessionId,
        viewerSession: `participant-token-${index.toString().padStart(30, "0")}`,
        displayName: `Viewer ${index}`,
        status: "active",
      });
    }
    await expect(
      t.mutation(api.streamParticipantsV2.create, {
        sessionId,
        viewerSession: `participant-token-${"0".padStart(30, "0")}`,
        displayName: "Viewer 0",
        status: "active",
      }),
    ).resolves.toMatchObject({ display_name: "Viewer 0" });
    await expect(
      t.mutation(api.streamParticipantsV2.create, {
        sessionId,
        viewerSession: "participant-token-overflow-000000000000000000",
        displayName: "Overflow",
        status: "active",
      }),
    ).rejects.toThrow("participant limit");
  });

  it("admits host choices before opening viewer voting on creation and advancement", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const created = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
      allowedOptions: ["WHITE"],
      params: { _votesOpen: false },
    });
    const sessionId = created!.id as Id<"stream_sessions">;
    await expect(
      host.mutation(api.streamVotesV2.create, {
        sessionId,
        stepId: "colour",
        voteRound: 0,
        optionKey: "BLACK",
      }),
    ).rejects.toThrow("Choice");
    await host.mutation(api.streamVotesV2.create, {
      sessionId,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
    });
    await host.mutation(api.streamSessionsV2.update, {
      id: sessionId,
      currentStep: "pelt",
      stepIndex: 1,
      allowedOptions: ["SingleColour"],
      params: { _votesOpen: false },
    });
    await host.mutation(api.streamVotesV2.create, {
      sessionId,
      stepId: "pelt",
      voteRound: 1,
      optionKey: "SingleColour",
    });
    expect(
      await t.query(api.streamVotesV2.list, { session: sessionId, limit: 500 }),
    ).toMatchObject([{ option_key: "SingleColour" }]);
  });

  it("preserves the deciding vote when coin-flip cleanup closes a tie-break", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const created = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
    });
    const id = created!.id as Id<"stream_sessions">;
    await host.mutation(api.streamSessionsV2.update, {
      id,
      allowedOptions: ["WHITE", "BLACK"],
      params: {
        _votesOpen: true,
        _tieFilter: ["WHITE", "BLACK"],
        _tieIteration: 1,
      },
    });
    for (const optionKey of ["WHITE", "BLACK"]) {
      const viewerSession = crypto.randomUUID();
      const participant = await t.mutation(api.streamParticipantsV2.create, {
        sessionId: id,
        viewerSession,
        displayName: optionKey,
        status: "active",
      });
      await t.mutation(api.streamVotesV2.create, {
        sessionId: id,
        stepId: "colour",
        voteRound: 1,
        optionKey,
        viewerSession,
        votedBy: participant!.id as Id<"stream_participants">,
      });
    }
    await host.mutation(api.streamVotesV2.create, {
      sessionId: id,
      stepId: "colour",
      voteRound: 1,
      optionKey: "BLACK",
    });
    await host.mutation(api.streamSessionsV2.update, {
      id,
      params: { _votesOpen: false },
      allowedOptions: ["WHITE", "BLACK"],
    });
    expect((await t.query(api.streamSessionsV2.get, { id }))?.vote_round).toBe(
      1,
    );
    const votes = await t.query(api.streamVotesV2.list, {
      session: id,
      stepId: "colour",
      limit: 500,
    });
    expect(votes).toHaveLength(3);
    expect(votes.filter((vote) => vote.option_key === "BLACK")).toHaveLength(2);
  });

  it("finds active owned sessions beyond newer completed sessions", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const active = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "active",
      status: "live",
    });
    for (let i = 0; i < 5; i++)
      await host.mutation(api.streamSessionsV2.create, {
        viewerKey: `completed-${i}`,
        status: "completed",
      });
    for (const filter of [{ status: "live" }, { exclude: "completed" }]) {
      expect(
        (
          await host.query(api.streamSessionsV2.list, { ...filter, limit: 2 })
        ).map((session) => session.id),
      ).toEqual([active!.id]);
    }
  });

  it("keeps viewer links unique and immutable", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const other = t.withIdentity({
      subject: "other",
      issuer: "https://identity.example",
    });
    const session = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "stable-viewer-key",
      status: "live",
    });
    if (!session) throw new Error("Session was not created");
    const sessionId = session.id as Id<"stream_sessions">;

    await expect(
      other.mutation(api.streamSessionsV2.create, {
        viewerKey: "stable-viewer-key",
        status: "live",
      }),
    ).rejects.toThrow("Viewer key already in use");
    await expect(
      host.mutation(api.streamSessionsV2.update, {
        id: sessionId,
        viewerKey: "attacker-selected-key",
      }),
    ).rejects.toThrow("Viewer key cannot be changed");

    expect(
      await t.query(api.streamSessionsV2.list, {
        viewerKey: "stable-viewer-key",
        limit: 1,
      }),
    ).toMatchObject([{ id: sessionId, viewer_key: "stable-viewer-key" }]);
  });

  it("enforces host, membership, choice, round, and one participant vote", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const other = t.withIdentity({
      subject: "other",
      issuer: "https://identity.example",
    });
    const created = await host.mutation(api.streamSessionsV2.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
      params: { _votesOpen: false },
    });
    const id = created!.id as Id<"stream_sessions">;
    const token = crypto.randomUUID();
    const participant = await t.mutation(api.streamParticipantsV2.create, {
      sessionId: id,
      viewerSession: token,
      displayName: "Viewer",
      status: "active",
    });
    expect(participant).not.toHaveProperty("viewer_session");
    expect(participant).not.toHaveProperty("fingerprint");
    const voter = {
      sessionId: id,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
      votedBy: participant!.id as Id<"stream_participants">,
      viewerSession: token,
    };
    await expect(
      other.mutation(api.streamSessionsV2.update, { id, status: "completed" }),
    ).rejects.toThrow("host");
    await host.mutation(api.streamSessionsV2.update, {
      id,
      allowedOptions: ["WHITE"],
      params: { _votesOpen: false },
    });
    await expect(t.mutation(api.streamVotesV2.create, voter)).rejects.toThrow(
      "closed",
    );
    await host.mutation(api.streamSessionsV2.update, {
      id,
      params: { _votesOpen: true },
    });
    await expect(
      t.mutation(api.streamVotesV2.create, {
        ...voter,
        viewerSession: crypto.randomUUID(),
      }),
    ).rejects.toThrow("participant");
    await expect(
      t.mutation(api.streamVotesV2.create, { ...voter, optionKey: "unlisted" }),
    ).rejects.toThrow("Choice");
    const results = await Promise.allSettled([
      t.mutation(api.streamVotesV2.create, voter),
      t.mutation(api.streamVotesV2.create, voter),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await host.mutation(api.streamVotesV2.create, {
      sessionId: id,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
    });
    expect(
      await t.query(api.streamVotesV2.list, { session: id, limit: 20 }),
    ).toHaveLength(2);
    await host.mutation(api.streamSessionsV2.update, {
      id,
      params: { _votesOpen: true, _tieIteration: 1 },
      allowedOptions: ["WHITE"],
    });
    await expect(t.mutation(api.streamVotesV2.create, voter)).rejects.toThrow(
      "round",
    );
    await host.mutation(api.streamParticipantsV2.update, {
      id: voter.votedBy,
      status: "removed",
    });
    await expect(
      t.mutation(api.streamVotesV2.create, { ...voter, voteRound: 1 }),
    ).rejects.toThrow("participant");
  });
});

it("requires the Discord service credential before config access", async () => {
  const t = convexTest(schema, modules);
  const token = crypto.randomUUID();
  vi.stubEnv("DISCORD_API_TOKEN", token);
  expect(
    (await t.fetch("/discord/user-config", { method: "POST", body: "{}" }))
      .status,
  ).toBe(401);
  const response = await t.fetch("/discord/user-config", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operation: "upsert",
      discordUserId: "fixture-user",
      darkForest: true,
    }),
  });
  expect(response.status).toBe(200);
  expect(
    (
      await t.query(internal.discordUserConfigInternal.get, {
        discordUserId: "fixture-user",
      })
    ).darkForest,
  ).toBe(true);
  expect(
    (
      await t.query(internal.discordUserConfigInternal.get, {
        discordUserId: "other-user",
      })
    ).darkForest,
  ).toBe(false);
});

it("paginates approved cards without including pending records", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("card_season", {
      seasonName: "Fixture",
      createdAt: 1,
      updatedAt: 1,
    });
    const rarityId = await ctx.db.insert("rarity", {
      rarityName: "Common",
      createdAt: 1,
      updatedAt: 1,
    });
    for (let i = 0; i < 55; i++)
      await ctx.db.insert("catdex", {
        catName: `Cat ${i}`,
        twitchUserName: "Fixture",
        seasonId,
        rarityId,
        approved: i !== 0,
        createdAt: i,
        updatedAt: i,
      });
  });
  const first = await t.query(api.catdex.page, {
    approved: true,
    paginationOpts: { numItems: 48, cursor: null },
  });
  const next = await t.query(api.catdex.page, {
    approved: true,
    paginationOpts: { numItems: 48, cursor: first.continueCursor },
  });
  expect(first.page).toHaveLength(48);
  expect(next.page).toHaveLength(6);
  expect(new Set([...first.page, ...next.page].map((cat) => cat.id)).size).toBe(
    54,
  );
  expect(next.isDone).toBe(true);
  expect(await t.query(api.catdex.hasPending, {})).toBe(true);
});

it("generates bounded managed upload reservations for Catdex submissions", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://fixture.convex.site");
  const t = convexTest(schema, modules);
  const clientKey = "fixture-client-key";
  await expect(
    t.mutation(api.catdex.generateUploadUrl, { clientKey }),
  ).resolves.toMatch(/\/catdex\/upload\?token=/);
  await expect(
    t.run((ctx) => ctx.db.query("catdex_uploads").take(100)),
  ).resolves.toHaveLength(1);

  for (let i = 0; i < 11; i += 1) {
    await t.mutation(api.catdex.generateUploadUrl, { clientKey });
  }
  await expect(
    t.mutation(api.catdex.generateUploadUrl, { clientKey }),
  ).rejects.toThrow("Too many pending uploads");
  await expect(
    t.mutation(api.catdex.generateUploadUrl, {
      clientKey: "another-client-key",
    }),
  ).resolves.toMatch(/\/catdex\/upload\?token=/);
});

it("resets only the authenticated user's variants and preserves the account", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "owner",
    issuer: "https://identity.example",
  });
  await user.mutation(api.users.getOrCreateUser, {});
  const before = await user.query(api.users.viewer, {});
  await t.run(async (ctx) => {
    const otherId = await ctx.db.insert("users", {
      tokenIdentifier: "fixture-other",
      showProfilePic: false,
      createdAt: 1,
      updatedAt: 1,
    });
    for (let i = 0; i < 102; i++)
      await ctx.db.insert("user_variants", {
        userId: i === 101 ? otherId : before!._id,
        toolKey: "pixelator",
        variantId: String(i),
        name: "Fixture",
        settings: {},
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      });
  });
  await expect(t.mutation(api.users.resetSavedVariants, {})).rejects.toThrow(
    "authenticated",
  );
  expect(await user.mutation(api.users.resetSavedVariants, {})).toEqual({
    remaining: true,
  });
  expect(await user.mutation(api.users.resetSavedVariants, {})).toEqual({
    remaining: false,
  });
  expect(
    await t.run((ctx) => ctx.db.query("user_variants").collect()),
  ).toHaveLength(1);
  expect(await user.query(api.users.viewer, {})).toEqual(before);
});
