// Local browser fixture only. Production auth and API handlers are unchanged.
import "./services";

declare global {
  interface Window {
    streamFixture: { requests: string[]; completeProfile: () => void };
  }
}

const query = new URL(location.href).searchParams;
let profileReady = !query.has("fresh");
let releaseProfile: (() => void) | undefined;
const profileGate = new Promise<void>((resolve) => {
  releaseProfile = resolve;
});
const requests: string[] = [];
const sessionKey = "stream-control-fixture-session";
const viewer = {
  _id: "fixture-user",
  username: "Local QA",
  role: "user",
  apiKey: "local-stream-fixture",
  created: 1,
};
const initialSession = {
  id: "fixture-session",
  userId: viewer._id,
  status: "active",
  settings: {},
  currentCommand: { type: "lobby", seq: 1, timestamp: Date.now() },
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
let session = query.has("fresh")
  ? null
  : (JSON.parse(localStorage.getItem(sessionKey) ?? "null") ?? initialSession);

Object.assign(window, {
  streamFixture: {
    requests,
    completeProfile: () => releaseProfile?.(),
  },
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const sources = new Set<FixtureEventSource>();
class FixtureEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  constructor() {
    sources.add(this);
  }
  close() {
    sources.delete(this);
  }
}
window.EventSource = FixtureEventSource as unknown as typeof EventSource;
function publish() {
  localStorage.setItem(sessionKey, JSON.stringify(session));
  for (const source of sources)
    source.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ revision: session.revision, data: session }),
      }),
    );
}
window.addEventListener("storage", (event) => {
  if (event.key !== sessionKey || !event.newValue) return;
  session = JSON.parse(event.newValue);
  for (const source of sources)
    source.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ revision: session.revision, data: session }),
      }),
    );
});

const previousFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.origin,
  );
  if (url.pathname === "/api/renderer") {
    return response({ image: "/sprites/fademask.png", meta: {}, layers: [] });
  }
  if (url.pathname === "/api/users/viewer") {
    requests.push(profileReady ? "viewer:ready" : "viewer:pending");
    return response(profileReady ? viewer : null);
  }
  if (url.pathname === "/api/users/ensure") {
    requests.push("profile:start");
    if (!profileReady) await profileGate;
    profileReady = true;
    requests.push("profile:ready");
    return response(viewer);
  }
  if (url.pathname === "/api/cat-stream") {
    if (init?.method !== "POST") {
      requests.push("session:read");
      return response(session);
    }
    const args = JSON.parse(String(init.body));
    requests.push(args.operation);
    if (!profileReady)
      return response({ error: "User not found", code: "not_found" }, 404);
    session ??= { ...initialSession };
    if (args.settings)
      session.settings = { ...session.settings, ...args.settings };
    if (args.operation === "triggerSpin")
      session.currentCommand = {
        type: "spin",
        ...args,
        seq: (session.currentCommand?.seq ?? 0) + 1,
        timestamp: Date.now(),
      };
    if (args.operation === "showLobby")
      session.currentCommand = {
        type: "lobby",
        seq: (session.currentCommand?.seq ?? 0) + 1,
        timestamp: Date.now(),
      };
    session.revision++;
    publish();
    return response(
      args.operation === "ensureSession"
        ? session.id
        : session.currentCommand.seq,
    );
  }
  return previousFetch(input, init);
};

// Render the real overlay component inside the control page's preview iframe.
new MutationObserver(() => {
  const iframe = document.querySelector<HTMLIFrameElement>(
    'iframe[title="OBS Overlay Preview"]',
  );
  if (iframe && !iframe.src.includes("stream-control.html"))
    iframe.src = `${location.pathname}?obs=1`;
}).observe(document.documentElement, { childList: true, subtree: true });
