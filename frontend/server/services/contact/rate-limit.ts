import "server-only";

import ipaddr from "ipaddr.js";

const WINDOW_MS = 10 * 60 * 1000;
// Per-pod limits deliberately approximate 3 per IP and 30 globally across 3 replicas.
const PER_IP_LIMIT = 1;
const GLOBAL_LIMIT = 10;
const clients = new Map<string, number[]>();
let submissions: number[] = [];
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

export function contactClientIp(headers: Headers): string {
  // Trust only headers supplied by the ingress. X-Real-IP must be overwritten
  // there; the rightmost XFF entry is the one appended by the nearest proxy.
  const candidate =
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (!candidate || !ipaddr.isValid(candidate)) return "unknown";
  // Canonicalize IPv6 and IPv4-mapped addresses so spelling cannot bypass limits.
  return ipaddr.process(candidate).toString();
}

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  submissions = submissions.filter((time) => time > cutoff);
  for (const [ip, times] of clients) {
    const active = times.filter((time) => time > cutoff);
    if (active.length) clients.set(ip, active);
    else clients.delete(ip);
  }
}

function scheduleCleanup() {
  if (cleanupTimer || !submissions.length) return;
  // An expiry timer also removes IPs when no more requests arrive.
  cleanupTimer = setTimeout(
    () => {
      cleanupTimer = undefined;
      prune();
      scheduleCleanup();
    },
    Math.max(1, submissions[0] + WINDOW_MS - Date.now()),
  );
  cleanupTimer.unref?.();
}

export function acceptContactSubmission(ip: string): boolean {
  prune();
  const times = clients.get(ip) ?? [];
  if (times.length >= PER_IP_LIMIT || submissions.length >= GLOBAL_LIMIT)
    return false;
  const now = Date.now();
  times.push(now);
  clients.set(ip, times);
  submissions.push(now);
  scheduleCleanup();
  return true;
}
