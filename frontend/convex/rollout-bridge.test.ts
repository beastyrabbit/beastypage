/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("keeps old anonymous host, participant and unversioned votes usable during the bridge", async () => {
  const t = convexTest(schema, modules);
  const session = await t.mutation(api.streamSessions.create, {
    viewerKey: "old-room",
    status: "live",
    currentStep: "colour",
  });
  const sessionId = session!.id as Id<"stream_sessions">;
  const participant = await t.mutation(api.streamParticipants.create, {
    sessionId,
    viewerSession: "name-old-viewer",
    displayName: "Old viewer",
    status: "active",
    fingerprint: "old-fingerprint",
  });
  const participantId = participant!.id as Id<"stream_participants">;
  await t.mutation(api.streamVotes.create, {
    sessionId,
    stepId: "colour",
    optionKey: "WHITE",
    votedBy: participantId,
  });
  expect(
    await t.query(api.streamVotes.list, { session: sessionId, limit: 500 }),
  ).toMatchObject([{ option_key: "WHITE" }]);
  for (const result of [
    participant,
    await t.query(api.streamParticipants.get, { id: participantId }),
    ...(await t.query(api.streamParticipants.list, {
      session: sessionId,
      limit: 500,
    })),
  ]) {
    expect(result).not.toHaveProperty("viewer_session");
    expect(result).not.toHaveProperty("fingerprint");
  }
  await t.mutation(api.streamSessions.update, {
    id: sessionId,
    currentStep: "pelt",
    stepIndex: 1,
  });
  expect(await t.run((ctx) => ctx.db.get(sessionId))).not.toHaveProperty(
    "allowedOptions",
  );
  await t.mutation(api.streamParticipants.update, {
    id: participantId,
    status: "removed",
  });
  expect(
    await t.query(api.streamParticipants.get, { id: participantId }),
  ).toMatchObject({ status: "removed" });
  expect(await t.query(api.streamSessions.list, { limit: 1 })).toMatchObject([
    { id: sessionId },
  ]);
});

it("blocks every legacy session entry point for modern records, including ownerless markers", async () => {
  const t = convexTest(schema, modules);
  const host = t.withIdentity({
    subject: "host",
    issuer: "https://identity.example",
  });
  const modern = await host.mutation(api.streamSessionsV2.create, {
    viewerKey: "modern",
    status: "live",
  });
  const ownedId = modern!.id as Id<"stream_sessions">;
  const ownerlessId = await t.run((ctx) =>
    ctx.db.insert("stream_sessions", {
      viewerKey: "marked",
      status: "live",
      allowedOptions: [],
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  for (const sessionId of [ownedId, ownerlessId]) {
    const participantId = await t.run((ctx) =>
      ctx.db.insert("stream_participants", {
        sessionId,
        displayName: "Viewer",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    for (const request of [
      () => t.query(api.streamSessions.get, { id: sessionId }),
      () =>
        t.mutation(api.streamSessions.update, {
          id: sessionId,
          status: "completed",
        }),
      () => t.query(api.streamParticipants.get, { id: participantId }),
      () =>
        t.query(api.streamParticipants.list, {
          session: sessionId,
          limit: 500,
        }),
      () =>
        t.mutation(api.streamParticipants.create, {
          sessionId,
          displayName: "Spoof",
          status: "active",
        }),
      () =>
        t.mutation(api.streamParticipants.update, {
          id: participantId,
          status: "removed",
        }),
      () => t.query(api.streamVotes.list, { session: sessionId, limit: 500 }),
      () =>
        t.mutation(api.streamVotes.create, {
          sessionId,
          stepId: "colour",
          optionKey: "WHITE",
          votedBy: participantId,
        }),
    ])
      await expect(request()).rejects.toThrow("Reload");
  }
  const legacy = await t.mutation(api.streamSessions.create, {
    viewerKey: "legacy",
    status: "live",
  });
  expect(await t.query(api.streamSessions.list, { limit: 1 })).toMatchObject([
    { id: legacy!.id },
  ]);
});

it("legacy adoption cannot attach a profile or edit modern batches and all projections omit capabilities", async () => {
  const t = convexTest(schema, modules);
  const profile = await t.mutation(api.mapper.create, {
    catData: { params: {} },
  });
  const profileId = profile.id as Id<"cat_profile">;
  const batch = await t.mutation(api.adoption.createBatch, {
    cats: [
      {
        label: "Old cat",
        catData: {},
        profileId,
        editToken: profile.editToken!,
      },
    ],
  });
  expect(await t.run((ctx) => ctx.db.get(profileId))).not.toHaveProperty(
    "adoptionBatchId",
  );
  await t.mutation(api.adoption.updateBatchMeta, {
    id: batch.id as Id<"adoption_batch">,
    title: "Legacy title",
  });
  const modern = await t.mutation(api.adoptionV2.createBatch, {
    cats: [{ label: "New cat", catData: {} }],
  });
  await expect(
    t.mutation(api.adoption.updateBatchMeta, {
      id: modern.id as Id<"adoption_batch">,
      title: "Spoof",
    }),
  ).rejects.toThrow("Reload");
  for (const slug of [batch.slug, modern.slug]) {
    for (const result of [
      await t.query(api.adoption.getBySlug, { slugOrId: slug }),
      await t.query(api.adoptionV2.getBySlug, { slugOrId: slug }),
    ]) {
      expect(JSON.stringify(result)).not.toContain(profile.editToken);
      expect(JSON.stringify(result)).not.toContain(modern.editToken);
    }
  }
});

it("tells old account deletion clients to reload without deleting user data", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "user",
    issuer: "https://identity.example",
  });
  const profile = await user.mutation(api.mapper.create, {
    catData: { params: {} },
  });
  const id = profile.id as Id<"cat_profile">;
  const before = await t.run((ctx) => ctx.db.get(id));
  await expect(user.mutation(api.users.deleteAccount, {})).rejects.toThrow(
    /reload/i,
  );
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
});
