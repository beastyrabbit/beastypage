import type { AccessibleRoom, CanvasRoom } from "./types";

/** Canvas backend base URL. Use `/canvas-api` in production (same-origin, no CORS). */
const CANVAS_API =
  process.env.NEXT_PUBLIC_CANVAS_API_URL ?? "https://stream-canvas.localhost:1355";

/** Fetch helper that attaches the Clerk session token. */
async function fetchApi(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${CANVAS_API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      ...(init?.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `API error ${res.status}`,
    );
  }
  return res.json();
}

/** Create or get the current user's room. */
export function createRoom(
  getToken: () => Promise<string | null>,
): Promise<CanvasRoom> {
  return fetchApi("/api/rooms", getToken, { method: "POST" });
}

/** Get the current user's room. */
export function getMyRoom(
  getToken: () => Promise<string | null>,
): Promise<CanvasRoom> {
  return fetchApi("/api/rooms/me", getToken);
}

/** List all rooms the user can access (own + invited). */
export function getAccessibleRooms(
  getToken: () => Promise<string | null>,
): Promise<AccessibleRoom[]> {
  return fetchApi("/api/rooms/accessible", getToken);
}

/** Update room config. */
export function updateRoom(
  roomId: string,
  data: { twitchChannel?: string; allowedUsers?: string[] },
  getToken: () => Promise<string | null>,
): Promise<CanvasRoom> {
  return fetchApi(`/api/rooms/${roomId}`, getToken, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Regenerate the OBS room secret. */
export function regenerateSecret(
  roomId: string,
  getToken: () => Promise<string | null>,
): Promise<{ ok: boolean }> {
  return fetchApi(`/api/rooms/${roomId}/regenerate-secret`, getToken, {
    method: "POST",
  });
}

/** Get the OBS secret (owner only, for settings page). */
export function getObsSecret(
  roomId: string,
  getToken: () => Promise<string | null>,
): Promise<{ obsSecret: string }> {
  return fetchApi(`/api/rooms/${roomId}/obs-secret`, getToken);
}

/** Exchange an OBS bootstrap secret for a short-lived WS token (unauthenticated). */
export async function exchangeObsToken(
  secret: string,
): Promise<{ token: string; roomId: string; twitchChannel: string | null; expiresIn: number }> {
  const res = await fetch(`${CANVAS_API}/obs/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Token exchange failed`,
    );
  }
  return res.json();
}

/** Upload a file to a room. Returns the upload URL. */
export async function uploadFile(
  roomId: string,
  file: File,
  getToken: () => Promise<string | null>,
): Promise<{ id: string; url: string; filename: string }> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${CANVAS_API}/api/rooms/${roomId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Upload failed`,
    );
  }
  return res.json();
}

/** Build an absolute WebSocket URL, handling both relative and absolute CANVAS_API. */
function buildWsUrl(roomId: string, token: string): string {
  let base: string;
  if (CANVAS_API.startsWith("/")) {
    // Relative path — construct from current page origin
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost";
    base = `${proto}//${host}${CANVAS_API}`;
  } else {
    base = CANVAS_API.replace(/^http/, "ws");
  }
  return `${base}/ws?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;
}

export const buildEditorWsUrl = buildWsUrl;
export const buildObsWsUrl = buildWsUrl;
