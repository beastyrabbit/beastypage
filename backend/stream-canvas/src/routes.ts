import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import {
  extractBearer,
  mintObsToken,
  verifyClerkJwt,
} from "./auth.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { rooms, uploads } from "./schema.ts";
import type { ClerkClaims } from "./types.ts";

// ---------------------------------------------------------------------------
// Middleware: require Clerk JWT
// ---------------------------------------------------------------------------

type AuthEnv = { Variables: { clerkUser: ClerkClaims } };

const requireAuth = new Hono<AuthEnv>();
requireAuth.use("*", async (c, next) => {
  const bearer = extractBearer(c.req.header("Authorization"));
  if (!bearer) return c.json({ error: "Missing authorization" }, 401);

  try {
    const claims = await verifyClerkJwt(bearer);
    c.set("clerkUser", claims);
    await next();
  } catch (err) {
    console.error("[auth] JWT verification failed:", err);
    return c.json({ error: "Invalid token" }, 401);
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const api = new Hono();

// Health check
api.get("/health", (c) => c.json({ status: "ok" }));

// Serve uploaded files (public)
api.get("/uploads/:uploadId/:filename", async (c) => {
  const upload = await db.query.uploads.findFirst({
    where: eq(uploads.id, c.req.param("uploadId")),
  });
  if (!upload || !existsSync(upload.path)) {
    return c.json({ error: "Not found" }, 404);
  }
  c.header("Content-Type", upload.mimeType);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  const stream = createReadStream(upload.path);
  return c.body(Readable.toWeb(stream) as ReadableStream);
});

// ---------------------------------------------------------------------------
// OBS token exchange (unauthenticated — exchanges room secret for short-lived WS token)
// ---------------------------------------------------------------------------

/**
 * The OBS browser source page has no Clerk session. It exchanges the
 * long-lived obsSecret (from the OBS URL) for a short-lived WS token.
 */
api.post("/obs/token", async (c) => {
  const body = await c.req.json<{ secret: string }>();
  if (!body.secret) return c.json({ error: "Missing secret" }, 400);

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.obsSecret, body.secret),
  });
  if (!room) return c.json({ error: "Invalid secret" }, 401);

  const token = mintObsToken(room.id);
  return c.json({
    token,
    roomId: room.id,
    twitchChannel: room.twitchChannel,
    expiresIn: config.obsTokenTtlSeconds,
  });
});

// --- Authenticated routes ---------------------------------------------------

const authed = new Hono<AuthEnv>();
authed.route("", requireAuth);

// Create a room
authed.post("/rooms", async (c) => {
  const user = c.get("clerkUser");

  // Check if user already has a room
  const existing = await db.query.rooms.findFirst({
    where: eq(rooms.ownerClerkId, user.sub),
  });
  if (existing) {
    return c.json(sanitizeRoom(existing));
  }

  const id = uuidv4();
  const now = new Date();
  const obsSecret = uuidv4();

  await db.insert(rooms).values({
    id,
    ownerClerkId: user.sub,
    obsSecret,
    allowedUsers: [],
    createdAt: now,
    updatedAt: now,
  });

  const room = await db.query.rooms.findFirst({ where: eq(rooms.id, id) });
  if (!room) return c.json({ error: "Room created but could not be retrieved" }, 500);
  return c.json(sanitizeRoom(room), 201);
});

// Get current user's room
authed.get("/rooms/me", async (c) => {
  const user = c.get("clerkUser");
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.ownerClerkId, user.sub),
  });
  if (!room) return c.json({ error: "No room found" }, 404);
  return c.json(sanitizeRoom(room));
});

// List all rooms the user can access (own room + rooms they're allowed on)
authed.get("/rooms/accessible", async (c) => {
  const user = c.get("clerkUser");

  const allRooms = await db.select().from(rooms);
  const accessible = allRooms.filter((r) => {
    if (r.ownerClerkId === user.sub) return true;
    return r.allowedUsers?.includes(user.sub) ?? false;
  });

  return c.json(
    accessible.map((r) => ({
      ...sanitizeRoom(r),
      isOwner: r.ownerClerkId === user.sub,
    })),
  );
});

// Update room config
authed.patch("/rooms/:id", async (c) => {
  const room = await findOwnedRoom(c);
  if (!room) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{
    twitchChannel?: string;
    allowedUsers?: string[];
  }>();

  await db
    .update(rooms)
    .set({
      ...(body.twitchChannel !== undefined && {
        twitchChannel: body.twitchChannel,
      }),
      ...(body.allowedUsers !== undefined && {
        allowedUsers: body.allowedUsers,
      }),
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, room.id));

  const updated = await db.query.rooms.findFirst({
    where: eq(rooms.id, room.id),
  });
  return c.json(sanitizeRoom(updated!));
});

// Regenerate OBS secret
authed.post("/rooms/:id/regenerate-secret", async (c) => {
  const room = await findOwnedRoom(c);
  if (!room) return c.json({ error: "Not found" }, 404);

  const newSecret = uuidv4();
  await db
    .update(rooms)
    .set({ obsSecret: newSecret, updatedAt: new Date() })
    .where(eq(rooms.id, room.id));

  return c.json({ ok: true });
});

// Get the OBS secret (only the room owner can see this — for the settings page)
authed.get("/rooms/:id/obs-secret", async (c) => {
  const room = await findOwnedRoom(c);
  if (!room) return c.json({ error: "Not found" }, 404);

  return c.json({ obsSecret: room.obsSecret });
});

// Upload a file
authed.post("/rooms/:id/upload", async (c) => {
  const user = c.get("clerkUser");
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, c.req.param("id")),
  });
  if (!room) return c.json({ error: "Not found" }, 404);

  const isOwner = room.ownerClerkId === user.sub;
  const isAllowed = room.allowedUsers?.includes(user.sub) ?? false;
  if (!isOwner && !isAllowed) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({ error: "File too large (max 10 MB)" }, 413);
  }

  const ALLOWED_TYPES = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
  ]);
  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json({ error: "File type not allowed" }, 415);
  }

  const uploadId = uuidv4();
  const roomDir = join(config.uploadsDir, room.id);
  await mkdir(roomDir, { recursive: true });
  // Sanitize filename to prevent path traversal
  const safeName = basename(file.name).replace(/\.\./g, "_");
  const filePath = join(roomDir, `${uploadId}-${safeName}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  await db.insert(uploads).values({
    id: uploadId,
    roomId: room.id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: buffer.byteLength,
    path: filePath,
    createdAt: new Date(),
  });

  const url = `/uploads/${uploadId}/${encodeURIComponent(file.name)}`;
  return c.json({ id: uploadId, url, filename: file.name }, 201);
});

api.route("/api", authed);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a room by :id param and verify the authenticated user owns it. */
async function findOwnedRoom(c: Context<AuthEnv>) {
  const user = c.get("clerkUser");
  const roomId = c.req.param("id");
  if (!roomId) return null;

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, roomId),
  });
  if (!room || room.ownerClerkId !== user.sub) return null;
  return room;
}

/** Strip server-only fields before sending to client. */
function sanitizeRoom(room: {
  id: string;
  ownerClerkId: string;
  twitchChannel: string | null;
  obsSecret: string;
  allowedUsers: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}) {
  return {
    id: room.id,
    ownerClerkId: room.ownerClerkId,
    twitchChannel: room.twitchChannel,
    allowedUsers: room.allowedUsers ?? [],
    createdAt: room.createdAt?.toISOString() ?? null,
    updatedAt: room.updatedAt?.toISOString() ?? null,
  };
}
