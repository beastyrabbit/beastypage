/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

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
      t.mutation(api.adoption.createBatch, { cats: [cat] }),
    ).rejects.toThrow("Not authorized");
    const batch = await t.mutation(api.adoption.createBatch, {
      cats: [{ ...cat, editToken: profile.editToken! }],
    });
    for (const result of [
      await t.query(api.adoption.getBySlug, { slugOrId: batch.slug }),
      ...(await t.query(api.adoption.listBatches, {})),
    ]) {
      expect(JSON.stringify(result)).not.toContain(profile.editToken);
      expect(JSON.stringify(result)).not.toContain(batch.editToken);
      expect(result?.cats[0]).not.toHaveProperty("editToken");
    }
    await expect(
      t.mutation(api.adoption.updateBatchMeta, {
        id: batch.id as Id<"adoption_batch">,
        title: "Changed",
      }),
    ).rejects.toThrow("Not authorized");
    await t.mutation(api.adoption.updateBatchMeta, {
      id: batch.id as Id<"adoption_batch">,
      editToken: batch.editToken,
      title: "Changed",
    });
    expect(
      (await t.query(api.adoption.getBySlug, { slugOrId: batch.slug }))?.title,
    ).toBe("Changed");
  });
});

describe("legacy voting transactions", () => {
  it("preserves only verified host presentation metadata and ignores participant spoofing", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const session = await host.mutation(api.streamSessions.create, {
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
    await expect(t.mutation(api.streamVotes.create, vote)).rejects.toThrow(
      "host",
    );
    await host.mutation(api.streamVotes.create, vote);
    const viewerSession = crypto.randomUUID();
    const participant = await t.mutation(api.streamParticipants.create, {
      sessionId,
      viewerSession,
      displayName: "Viewer",
      status: "active",
    });
    await t.mutation(api.streamVotes.create, {
      ...vote,
      viewerSession,
      votedBy: participant!.id as Id<"stream_participants">,
    });
    const votes = await t.query(api.streamVotes.list, {
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

  it("admits host choices before opening viewer voting on creation and advancement", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const created = await host.mutation(api.streamSessions.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
      allowedOptions: ["WHITE"],
      params: { _votesOpen: false },
    });
    const sessionId = created!.id as Id<"stream_sessions">;
    await expect(
      host.mutation(api.streamVotes.create, {
        sessionId,
        stepId: "colour",
        voteRound: 0,
        optionKey: "BLACK",
      }),
    ).rejects.toThrow("Choice");
    await host.mutation(api.streamVotes.create, {
      sessionId,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
    });
    await host.mutation(api.streamSessions.update, {
      id: sessionId,
      currentStep: "pelt",
      stepIndex: 1,
      allowedOptions: ["SingleColour"],
      params: { _votesOpen: false },
    });
    await host.mutation(api.streamVotes.create, {
      sessionId,
      stepId: "pelt",
      voteRound: 1,
      optionKey: "SingleColour",
    });
    expect(
      await t.query(api.streamVotes.list, { session: sessionId, limit: 500 }),
    ).toMatchObject([{ option_key: "SingleColour" }]);
  });

  it("preserves the deciding vote when coin-flip cleanup closes a tie-break", async () => {
    const t = convexTest(schema, modules);
    const host = t.withIdentity({
      subject: "host",
      issuer: "https://identity.example",
    });
    const created = await host.mutation(api.streamSessions.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
    });
    const id = created!.id as Id<"stream_sessions">;
    await host.mutation(api.streamSessions.update, {
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
      const participant = await t.mutation(api.streamParticipants.create, {
        sessionId: id,
        viewerSession,
        displayName: optionKey,
        status: "active",
      });
      await t.mutation(api.streamVotes.create, {
        sessionId: id,
        stepId: "colour",
        voteRound: 1,
        optionKey,
        viewerSession,
        votedBy: participant!.id as Id<"stream_participants">,
      });
    }
    await host.mutation(api.streamVotes.create, {
      sessionId: id,
      stepId: "colour",
      voteRound: 1,
      optionKey: "BLACK",
    });
    await host.mutation(api.streamSessions.update, {
      id,
      params: { _votesOpen: false },
      allowedOptions: ["WHITE", "BLACK"],
    });
    expect((await t.query(api.streamSessions.get, { id }))?.vote_round).toBe(1);
    const votes = await t.query(api.streamVotes.list, {
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
    const active = await host.mutation(api.streamSessions.create, {
      viewerKey: "active",
      status: "live",
    });
    for (let i = 0; i < 5; i++)
      await host.mutation(api.streamSessions.create, {
        viewerKey: `completed-${i}`,
        status: "completed",
      });
    for (const filter of [{ status: "live" }, { exclude: "completed" }]) {
      expect(
        (
          await host.query(api.streamSessions.list, { ...filter, limit: 2 })
        ).map((session) => session.id),
      ).toEqual([active!.id]);
    }
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
    const created = await host.mutation(api.streamSessions.create, {
      viewerKey: "fixture",
      status: "live",
      currentStep: "colour",
      params: { _votesOpen: false },
    });
    const id = created!.id as Id<"stream_sessions">;
    const token = crypto.randomUUID();
    const participant = await t.mutation(api.streamParticipants.create, {
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
      other.mutation(api.streamSessions.update, { id, status: "completed" }),
    ).rejects.toThrow("host");
    await host.mutation(api.streamSessions.update, {
      id,
      allowedOptions: ["WHITE"],
      params: { _votesOpen: false },
    });
    await expect(t.mutation(api.streamVotes.create, voter)).rejects.toThrow(
      "closed",
    );
    await host.mutation(api.streamSessions.update, {
      id,
      params: { _votesOpen: true },
    });
    await expect(
      t.mutation(api.streamVotes.create, {
        ...voter,
        viewerSession: crypto.randomUUID(),
      }),
    ).rejects.toThrow("participant");
    await expect(
      t.mutation(api.streamVotes.create, { ...voter, optionKey: "unlisted" }),
    ).rejects.toThrow("Choice");
    const results = await Promise.allSettled([
      t.mutation(api.streamVotes.create, voter),
      t.mutation(api.streamVotes.create, voter),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await host.mutation(api.streamVotes.create, {
      sessionId: id,
      stepId: "colour",
      voteRound: 0,
      optionKey: "WHITE",
    });
    expect(
      await t.query(api.streamVotes.list, { session: id, limit: 20 }),
    ).toHaveLength(2);
    await host.mutation(api.streamSessions.update, {
      id,
      params: { _votesOpen: true, _tieIteration: 1 },
      allowedOptions: ["WHITE"],
    });
    await expect(t.mutation(api.streamVotes.create, voter)).rejects.toThrow(
      "round",
    );
    await host.mutation(api.streamParticipants.update, {
      id: voter.votedBy,
      status: "removed",
    });
    await expect(
      t.mutation(api.streamVotes.create, { ...voter, voteRound: 1 }),
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
      await t.query(internal.discordUserConfig.get, {
        discordUserId: "fixture-user",
      })
    ).darkForest,
  ).toBe(true);
  expect(
    (
      await t.query(internal.discordUserConfig.get, {
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
