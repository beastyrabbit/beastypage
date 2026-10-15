// Synthetic Convex export for tests and local rehearsals. Contains no real
// data. Run: pnpm run import:fixture -- <out.zip>

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import yazl from "yazl";

export const FIXTURE_ISSUER = "https://clerk.fixture.test";
/** Freeze used by tests; expiries before it are skipped. */
export const FIXTURE_FREEZE = new Date("2026-10-15T12:00:00Z");

const t = (iso: string) => Date.parse(iso);
const CREATED = t("2026-01-02T03:04:05Z");
const LATER = t("2026-02-03T04:05:06Z");
const BEFORE_FREEZE = t("2026-10-15T11:00:00Z");
const AFTER_FREEZE = t("2026-10-15T13:00:00Z");

/** Convex-shaped ids: 32 lower-case base32 characters, unique per name. */
export function fixtureId(name: string): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const hash = createHash("sha256").update(name).digest();
  return Array.from(hash.subarray(0, 32), (b) => alphabet[b % 32]).join("");
}

const id = fixtureId;
const doc = (name: string, fields: Record<string, unknown>) => ({
  _id: id(name),
  _creationTime: CREATED + 0.25,
  ...fields,
});
const owner = (who: string) => `${FIXTURE_ISSUER}|user_${who}`;

const params = {
  spriteNumber: 8,
  peltName: "Tabby",
  colour: "GINGER",
  isTortie: false,
  eyeColour: "YELLOW",
  skinColour: "PINK",
  shading: false,
  reverse: false,
};
const catData = {
  params,
  accessorySlots: ["none"],
  scarSlots: [],
  tortieSlots: [null],
  counts: { accessories: 0, scars: 0, tortie: 0 },
};

async function png(
  colour: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: colour },
  })
    .png()
    .toBuffer();
}

export interface Fixture {
  tables: Record<string, unknown[]>;
  storage: { meta: Record<string, unknown>; name: string; bytes: Buffer }[];
}

export async function buildFixture(): Promise<Fixture> {
  const red = await png("#ff0000", 4, 3);
  const blue = await png("#0000ff", 2, 2);
  const text = Buffer.from("not an image");
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const storageDoc = (name: string, bytes: Buffer, contentType?: string) => ({
    meta: {
      _id: id(name),
      _creationTime: CREATED,
      sha256: sha(bytes),
      size: bytes.length,
      ...(contentType ? { contentType } : {}),
    },
    name: `_storage/${id(name)}`,
    bytes,
  });
  const storage = [
    storageDoc("file-card-back", red, "image/png"),
    // Same bytes as the card back: deduplicated into one files row.
    storageDoc("file-card-copy", red, "image/png"),
    storageDoc("file-thumb", blue),
    storageDoc("file-text", text, "text/plain"),
    storageDoc("file-palette", blue, "image/png"),
    storageDoc("file-unreferenced", blue, "image/png"),
  ];
  // Base64 hash encoding must be accepted as well.
  const blueMeta = storage[2]?.meta;
  if (blueMeta)
    blueMeta.sha256 = Buffer.from(sha(blue), "hex").toString("base64");

  const tables: Record<string, unknown[]> = {
    users: [
      doc("user-ann", {
        tokenIdentifier: owner("ann"),
        username: "Ann_1",
        usernameSearch: "ann_1",
        showProfilePic: true,
        apiKey: "fixture-key-ann",
        createdAt: CREATED,
        updatedAt: LATER,
      }),
      doc("user-legacy", {
        tokenIdentifier: owner("bob"),
        username: "Bob",
        showProfilePic: false,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // Foreign issuer: quarantined.
      doc("user-foreign", {
        tokenIdentifier: "https://evil.test|user_x",
        showProfilePic: false,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    user_search_migrations: [
      doc("usm", {
        name: "usernameSearch",
        complete: true,
        updatedAt: CREATED,
      }),
    ],
    card_season: [
      doc("season-1", {
        seasonName: "Season One",
        shortName: "S1",
        cardBackStorageId: id("file-card-back"),
        cardBackWidth: 4,
        cardBackHeight: 3,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    rarity: [
      doc("rarity-1", {
        rarityName: "Common",
        stars: 1,
        chancePercent: 62.5,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    catdex: [
      doc("catdex-1", {
        twitchUserName: "viewer",
        catName: "Ember",
        seasonId: id("season-1"),
        rarityId: id("rarity-1"),
        approved: true,
        defaultCardStorageId: id("file-card-copy"),
        defaultCardThumbStorageId: id("file-thumb"),
        thumbnailStatus: "complete",
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // Wrong type for a known field: quarantined, not coerced.
      doc("catdex-bad", {
        twitchUserName: "viewer",
        catName: "Ash",
        seasonId: id("season-1"),
        rarityId: id("rarity-1"),
        approved: "yes",
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // Dangling season: quarantined.
      doc("catdex-orphan", {
        twitchUserName: "viewer",
        catName: "Moss",
        seasonId: id("season-gone"),
        rarityId: id("rarity-1"),
        approved: false,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    catdex_uploads: [
      doc("upload-live", {
        token: "tok-live",
        status: "pending",
        expiresAt: AFTER_FREEZE,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      doc("upload-expired", {
        token: "tok-old",
        status: "pending",
        expiresAt: BEFORE_FREEZE,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    collection: [
      doc("collection-1", {
        artistName: "Artist",
        animal: "cat",
        link: "https://example.com/a",
        fullImgStorageId: id("file-thumb"),
        focusX: 0.5,
        focusY: 0.25,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // References a non-image storage object: quarantined with its file.
      doc("collection-text", {
        artistName: "Artist",
        animal: "cat",
        link: "https://example.com/b",
        fullImgStorageId: id("file-text"),
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    coinflipper_scores: [
      doc("score-1", { playerName: "Ann", score: 12, createdAt: CREATED }),
    ],
    adoption_batch: [
      doc("batch-1", {
        slug: "litter-1",
        title: "Litter",
        ownerTokenIdentifier: owner("ann"),
        settings: {
          source: "evolution-generator",
          starter: {
            type: "history",
            slug: "fireheart",
            profileId: id("profile-1"),
          },
        },
        cats: [
          { label: "Kit 1", catData, profileId: id("profile-1") },
          { label: "Kit 2", catData, profileId: id("profile-deleted") },
        ],
        createdAt: CREATED,
        updatedAt: LATER,
      }),
    ],
    cat_profile: [
      doc("profile-1", {
        slug: "fireheart",
        catData: { ...catData, shareSlug: "share-1" },
        catName: "Fireheart",
        ownerTokenIdentifier: owner("ann"),
        editToken: "edit-1",
        adoptionBatchId: id("batch-1"),
        createdAt: CREATED,
        updatedAt: LATER,
      }),
      // Batch was deleted in Convex: reference set to null and counted.
      doc("profile-2", {
        slug: "greystripe",
        catData,
        adoptionBatchId: id("batch-deleted"),
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // Duplicate slug: the first holder wins, this one is quarantined.
      doc("profile-dup", {
        slug: "fireheart",
        catData,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    cat_images: [
      doc("image-1", {
        catProfileId: id("profile-1"),
        kind: "spriteSheet",
        storageId: id("file-thumb"),
        meta: { frames: 4 },
        width: 2,
        height: 2,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    cat_shares: [
      doc("share-1", {
        slug: "share-1",
        data: { v: 1, params, slots: { scars: [] }, counts: { scars: 0 } },
        createdAt: CREATED,
      }),
    ],
    single_cat_settings: [
      doc("scs-1", {
        slug: "settings-1",
        config: { v: 2, mode: "calm", catName: "Ember" },
        editToken: "edit-scs",
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    pixelator_settings: [
      doc("pix-1", {
        slug: "pix-1",
        config: {
          v: 1,
          pipeline: {
            steps: [
              {
                id: "s1",
                algorithm: "pixelate",
                params: { size: 4 },
                enabled: true,
                label: "Pixelate",
              },
            ],
          },
          pixelArtMode: false,
          pixelArtGridSize: null,
        },
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    dash_settings: [
      doc("dash-1", {
        slug: "dash-1",
        config: { v: 1, widgets: ["wheel"], lastSeenVersion: null },
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    palette_generator_settings: [
      doc("palette-1", {
        slug: "discord-1",
        config: {
          source: "discord",
          imageStorageId: id("file-palette"),
          colors: [
            { hex: "#0000ff", rgb: { r: 0, g: 0, b: 255 }, prevalence: 1 },
          ],
        },
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    ancestry_tree: [
      doc("tree-1", {
        slug: "tree-1",
        name: "Clan",
        foundingMotherId: "c1",
        foundingFatherId: "c2",
        passwordHash: "hash",
        config: { minChildren: 1, maxChildren: 3, depth: 2, genderRatio: 0.5 },
        cats: [
          {
            id: "c1",
            name: { prefix: "Fire", suffix: "heart", full: "Fireheart" },
            gender: "F",
            lifeStage: "adult",
            params,
            motherId: null,
            fatherId: null,
            partnerIds: ["c2"],
            childrenIds: [],
            genetics: {
              pelt: { allele1: "Tabby", allele2: "Tabby", expressed: "Tabby" },
              colour: {
                allele1: "GINGER",
                allele2: "GINGER",
                expressed: "GINGER",
              },
              eyeColour: {
                allele1: "YELLOW",
                allele2: "YELLOW",
                expressed: "YELLOW",
              },
              skinColour: {
                allele1: "PINK",
                allele2: "PINK",
                expressed: "PINK",
              },
              whitePatches: { allele1: null, allele2: null, expressed: null },
              isTortie: { allele1: false, allele2: false, expressed: false },
            },
            source: "history",
            historyProfileId: id("profile-1"),
            generation: 0,
          },
        ],
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    perfect_cats: [
      doc("perfect-1", {
        hash: "h1",
        params: { params },
        rating: 1500.5,
        wins: 1,
        losses: 0,
        appearances: 1,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      doc("perfect-2", {
        hash: "h2",
        params: { spriteNumber: 3, params },
        rating: 1499.5,
        wins: 0,
        losses: 1,
        appearances: 1,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    perfect_votes: [
      doc("pvote-1", {
        catAId: id("perfect-1"),
        catBId: id("perfect-2"),
        winnerId: id("perfect-1"),
        clientId: "client-1",
        createdAt: CREATED,
      }),
    ],
    perfect_matchups: [
      doc("matchup-live", {
        clientId: "client-1",
        catAId: id("perfect-1"),
        catBId: id("perfect-2"),
        token: "m-live",
        createdAt: CREATED,
        expiresAt: AFTER_FREEZE,
        consumed: false,
      }),
      doc("matchup-used", {
        clientId: "client-1",
        catAId: id("perfect-1"),
        catBId: id("perfect-2"),
        token: "m-used",
        createdAt: CREATED,
        expiresAt: AFTER_FREEZE,
        consumed: true,
      }),
    ],
    discord_challenge: [
      doc("challenge-old", {
        token: "c-old",
        answerHash: "a",
        salt: "s",
        expiresAt: BEFORE_FREEZE,
        createdAt: CREATED,
      }),
    ],
    discord_user_configs: [
      doc("dconf-1", {
        discordUserId: "100000000000000001",
        accessoriesMin: 0,
        accessoriesMax: 2,
        scarsMin: 0,
        scarsMax: 1,
        tortiesMin: 0,
        tortiesMax: 1,
        darkForest: false,
        starclan: true,
        palettes: ["base"],
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    stream_sessions: [
      doc("session-1", {
        ownerTokenIdentifier: owner("ann"),
        allowedOptions: ["a", "b"],
        voteRound: 1,
        viewerKey: "viewer-key-1",
        status: "voting",
        stepHistory: [{ step_id: "pelt", label: "Tabby", votes: 3 }],
        params: { ...params, _votesOpen: true, _finalName: null },
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    stream_participants: [
      doc("participant-1", {
        sessionId: id("session-1"),
        viewerSession: "vs-1",
        displayName: "Ann",
        status: "active",
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    stream_votes: [
      doc("vote-1", {
        sessionId: id("session-1"),
        voteRound: 1,
        stepId: "pelt",
        optionKey: "a",
        optionMeta: {
          participantId: id("participant-1"),
          participantName: "Ann",
        },
        votedBy: id("participant-1"),
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      // Participant was removed: vote kept, voter set to null.
      doc("vote-2", {
        sessionId: id("session-1"),
        voteRound: 1,
        stepId: "pelt",
        optionKey: "b",
        votedBy: id("participant-gone"),
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    wheel_spins: [
      doc("spin-1", {
        prizeName: "Kit",
        forced: false,
        randomBucket: 0.42,
        createdAt: CREATED,
      }),
    ],
    cat_stream_sessions: [
      doc("obs-1", {
        userId: id("user-ann"),
        status: "active",
        settings: {
          v: 2,
          mode: "flashy",
          lobbyCatCount: 5,
          overlayTheme: "field-guide",
        },
        currentCommand: { type: "spin", seq: 4, params, timestamp: LATER },
        testMode: false,
        batchState: {
          seq: 1,
          stageIndex: 0,
          awaitingCull: false,
          eliminatedIds: [],
        },
        createdAt: CREATED,
        updatedAt: LATER,
      }),
    ],
    user_variants: [
      doc("variant-1", {
        userId: id("user-ann"),
        toolKey: "dash",
        variantId: "dash-settings",
        name: "Dash",
        settings: { v: 1, widgets: ["wheel"] },
        isActive: true,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      doc("variant-unknown-tool", {
        userId: id("user-ann"),
        toolKey: "spaceship",
        variantId: "x",
        name: "?",
        settings: {},
        isActive: false,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    quick_share_uploads: [
      doc("qs-ready", {
        slug: "qs-ready",
        source: "file",
        originalName: "cat.png",
        originalSize: 1000,
        originalKey: "originals/qs-ready",
        publicKey: "public/qs-ready",
        publicMime: "image/webp",
        publicSize: 800,
        state: "ready",
        receiptHash: "r1",
        rateIdentity: "rate-1",
        ipHash: "ip-1",
        rawIp: "192.0.2.10",
        publicExpiresAt: AFTER_FREEZE,
        retainedUntil: AFTER_FREEZE,
        active: true,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
      doc("qs-uploading", {
        slug: "qs-up",
        source: "file",
        originalName: "big.png",
        originalSize: 9000000,
        originalKey: "originals/qs-up",
        multipartUploadId: "mp-1",
        state: "uploading",
        receiptHash: "r1",
        rateIdentity: "rate-1",
        ipHash: "ip-1",
        rawIp: "192.0.2.10",
        publicExpiresAt: AFTER_FREEZE,
        retainedUntil: AFTER_FREEZE,
        active: true,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    quick_share_parts: [
      doc("part-up", {
        uploadId: id("qs-uploading"),
        partNumber: 1,
        etag: "e1",
        size: 5000000,
        createdAt: CREATED,
      }),
      doc("part-done", {
        uploadId: id("qs-ready"),
        partNumber: 1,
        etag: "e2",
        size: 1000,
        createdAt: CREATED,
      }),
    ],
    quick_share_jobs: [
      doc("job-1", {
        uploadId: id("qs-ready"),
        kind: "process",
        status: "leased",
        attempts: 1,
        leaseId: "lease-1",
        leaseExpiresAt: AFTER_FREEZE,
        createdAt: CREATED,
        updatedAt: CREATED,
      }),
    ],
    quick_share_usage: [
      doc("usage-open", {
        identity: "rate-1",
        kind: "day",
        windowStart: CREATED,
        starts: 2,
        bytes: 10000,
        expiresAt: AFTER_FREEZE,
        updatedAt: CREATED,
      }),
      doc("usage-closed", {
        identity: "rate-1",
        kind: "hour",
        windowStart: CREATED,
        starts: 1,
        bytes: 1000,
        expiresAt: BEFORE_FREEZE,
        updatedAt: CREATED,
      }),
    ],
    quick_share_bans: [
      doc("ban-1", {
        ipHash: "ip-2",
        reason: "spam",
        active: true,
        createdBy: owner("ann"),
        createdAt: CREATED,
      }),
    ],
  };
  return { tables, storage };
}

/** Writes the fixture as a Convex-style export ZIP. */
export async function writeFixtureArchive(
  path: string,
  fixture?: Fixture,
): Promise<void> {
  const { tables, storage } = fixture ?? (await buildFixture());
  const zip = new yazl.ZipFile();
  const jsonl = (rows: unknown[]) =>
    Buffer.from(
      rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
    );
  zip.addBuffer(
    Buffer.from("Synthetic BeastyPage fixture; no real data.\n"),
    "README.md",
  );
  zip.addBuffer(
    jsonl(
      Object.keys(tables).map((name, index) => ({ name, id: 10_001 + index })),
    ),
    "_tables/documents.jsonl",
  );
  for (const [name, rows] of Object.entries(tables)) {
    zip.addBuffer(jsonl(rows), `${name}/documents.jsonl`);
  }
  zip.addBuffer(jsonl(storage.map((s) => s.meta)), "_storage/documents.jsonl");
  for (const file of storage) zip.addBuffer(file.bytes, file.name);
  zip.end();
  await new Promise<void>((done, fail) => {
    zip.outputStream
      .pipe(createWriteStream(path))
      .on("close", done)
      .on("error", fail);
  });
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: fixture.ts <out.zip>");
  writeFixtureArchive(out)
    .then(() => console.log(`Wrote synthetic Convex export to ${out}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
