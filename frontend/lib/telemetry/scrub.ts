const REDACTED = "[Filtered]";
const sensitiveKey =
  /(?:token|secret|password|authorization|cookie|email|username|session|signature|^sig$|^key$|^auth$|^code$|^edit$|^share$)/i;

/** Shared by error reporting and analytics. Capability paths are never reported. */
export function scrubUrl(value: string, excludeSearch = false): string {
  try {
    const relative = value.startsWith("/");
    const url = new URL(value, "https://telemetry.invalid");
    if (!["http:", "https:"].includes(url.protocol)) return REDACTED;
    url.username = "";
    url.password = "";
    url.hash = "";
    if (excludeSearch) url.search = "";
    else {
      for (const key of [...url.searchParams.keys()]) {
        if (sensitiveKey.test(key)) url.searchParams.set(key, REDACTED);
      }
    }
    url.pathname = url.pathname.replace(
      /(\/(?:view|adoption|ancestry-tree|evolution)\/)\S+/g,
      "$1[Filtered]",
    );
    return relative ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return REDACTED;
  }
}

export function scrubText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => scrubUrl(url, true))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g,
      REDACTED,
    )
    .replace(
      /((?:__session|__client_uat|token|key|secret|password|auth|code|session|signature|sig|edit|share)[\w-]*\s*[=:]\s*)[^\s&;,"'<>]+/gi,
      `$1${REDACTED}`,
    );
}

/** Pure, bounded traversal. Drops request bodies and identity rather than guessing their schema. */
export function scrubEvent<T>(event: T): T {
  const seen = new WeakSet<object>();
  function visit(value: unknown, depth: number): unknown {
    if (depth > 24) return REDACTED;
    if (typeof value === "string") return scrubText(value);
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return REDACTED;
    seen.add(value);
    if (Array.isArray(value))
      return value.map((item) => visit(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "user" || key === "cookies" || key === "request_body")
        continue;
      if (sensitiveKey.test(key)) result[key] = REDACTED;
      else if (key === "request" && item && typeof item === "object") {
        const { data: _data, ...request } = item as Record<string, unknown>;
        result[key] = visit(request, depth + 1);
      } else if (
        /^(url|href|referrer)$/i.test(key) &&
        typeof item === "string"
      ) {
        result[key] = scrubText(scrubUrl(item, true));
      } else result[key] = visit(item, depth + 1);
    }
    return result;
  }
  return visit(event, 0) as T;
}
