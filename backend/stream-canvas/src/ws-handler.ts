import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import {
  TLSocketRoom,
  SQLiteSyncStorage,
  NodeSqliteWrapper,
} from "@tldraw/sync-core";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./db.ts";
import { rooms } from "./schema.ts";
import { isOriginAllowed, verifyClerkJwt, verifyObsToken } from "./auth.ts";
import type { ConnectionRole } from "./types.ts";

// ---------------------------------------------------------------------------
// tldraw storage — each room gets its own SQLiteSyncStorage with a unique
// tablePrefix so documents are isolated per room in the same SQLite DB.
// ---------------------------------------------------------------------------

function createRoomStorage(roomId: string) {
  // Sanitize roomId for use as a SQL table prefix (UUIDs contain hyphens)
  const safePrefix = `tl_${roomId.replace(/-/g, "_")}_`;
  return new SQLiteSyncStorage({
    sql: new NodeSqliteWrapper(sqlite, { tablePrefix: safePrefix }),
  });
}

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

const activeRooms = new Map<string, TLSocketRoom>();

function getOrCreateRoom(roomId: string): TLSocketRoom {
  let room = activeRooms.get(roomId);
  if (room) return room;

  room = new TLSocketRoom({
    storage: createRoomStorage(roomId),
    onSessionRemoved(_room, { numSessionsRemaining }) {
      // Wait 30s before cleanup to allow brief reconnects (e.g., page refresh)
      if (numSessionsRemaining === 0) {
        setTimeout(() => {
          const r = activeRooms.get(roomId);
          if (r && r.getNumActiveSessions() === 0) {
            r.close();
            activeRooms.delete(roomId);
          }
        }, 30_000);
      }
    },
  });

  activeRooms.set(roomId, room);
  return room;
}

/** Close all active rooms (for graceful shutdown). */
export function closeAllRooms() {
  for (const [, room] of activeRooms) {
    room.close();
  }
  activeRooms.clear();
}

// ---------------------------------------------------------------------------
// WebSocket upgrade authentication
// ---------------------------------------------------------------------------

interface AuthResult {
  role: ConnectionRole;
  roomId: string;
  userId?: string;
}

/**
 * Authenticate a WebSocket upgrade request.
 *
 * Browser WebSocket() API does not support custom headers, so tokens
 * are passed as URL query parameters:
 *   ws://host/ws?roomId=XXX&token=CLERK_JWT_OR_OBS_TOKEN
 */
async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<AuthResult | null> {
  // Validate Origin header
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) {
    console.warn("[ws] rejected: invalid origin", origin);
    return null;
  }

  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const roomId = url.searchParams.get("roomId");
  const token = url.searchParams.get("token");
  if (!roomId || !token) return null;

  // Try as Clerk JWT first (canvas editors)
  try {
    const claims = await verifyClerkJwt(token);

    // Check if user is allowed in this room
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.id, roomId),
    });
    if (!room) return null;

    const isOwner = room.ownerClerkId === claims.sub;
    const isAllowed = room.allowedUsers?.includes(claims.sub) ?? false;
    if (!isOwner && !isAllowed) return null;

    return { role: "editor", roomId, userId: claims.sub };
  } catch (err) {
    // Not a valid Clerk JWT — try as OBS token
    console.debug("[ws] Clerk JWT verification failed, trying OBS token:",
      err instanceof Error ? err.message : err);
  }

  // Try as short-lived OBS token
  const obsClaims = verifyObsToken(token);
  if (obsClaims && obsClaims.roomId === roomId) {
    return { role: "obs", roomId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// WebSocket connection handler
// ---------------------------------------------------------------------------

/**
 * Handle a new WebSocket connection after HTTP upgrade.
 *
 * The `ws` library's WebSocket satisfies tldraw's `WebSocketMinimal` interface
 * (addEventListener, removeEventListener, send, close, readyState).
 * TLSocketRoom attaches its own event listeners internally via handleSocketConnect.
 */
export async function handleWebSocketUpgrade(
  ws: WebSocket,
  req: IncomingMessage,
) {
  const auth = await authenticateUpgrade(req);
  if (!auth) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const room = getOrCreateRoom(auth.roomId);
  const sessionId = crypto.randomUUID();

  // tldraw's TLSocketRoom attaches message/close/error listeners internally
  room.handleSocketConnect({
    sessionId,
    socket: ws,
    isReadonly: auth.role === "obs",
  });
}
