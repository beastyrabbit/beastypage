const REDACTED = "[Filtered]";
const sensitiveKey =
  /(?:token|secret|password|authorization|cookie|email|username|session|signature|^sig$|key$|^auth$|^code$|^edit$|^share$)/i;

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
      for (const key of new Set(url.searchParams.keys())) {
        if (sensitiveKey.test(key)) url.searchParams.set(key, REDACTED);
      }
    }
    url.pathname = url.pathname.replace(
      /(\/(?:view|adoption|ancestry-tree|evolution|i)\/)\S+/g,
      "$1[Filtered]",
    );
    return relative ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return REDACTED;
  }
}

function scrubEmails(value: string): string {
  const chunks: string[] = [];
  let copiedThrough = 0;
  // Scan each local part once and anchor the domain match so failed addresses
  // cannot retry an unbounded regex at every character in a long message.
  for (
    let at = value.indexOf("@");
    at !== -1;
    at = value.indexOf("@", at + 1)
  ) {
    let start = at;
    while (
      start > copiedThrough &&
      /[A-Z0-9._%+-]/i.test(value.charAt(start - 1))
    )
      start--;
    if (start === at) continue;
    const domain = /^[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value.slice(at + 1));
    if (!domain) continue;
    chunks.push(value.slice(copiedThrough, start), REDACTED);
    copiedThrough = at + 1 + domain[0].length;
  }
  return chunks.join("") + value.slice(copiedThrough);
}

export function scrubText(value: string): string {
  return scrubEmails(
    value
      .replace(/https?:\/\/[^\s<>"']+/gi, (url) => scrubUrl(url, true))
      // Relative fetch/EventSource URLs can contain percent-encoded parameter names.
      .replace(/(?<![\w:/])\/[^\s<>"']*\?[^\s<>"']+/g, (url) =>
        scrubUrl(url, true),
      )
      .replace(
        /(?<![\w:/])\/(?:view|adoption|ancestry-tree|evolution|i)\/[^\s<>"']+/g,
        (url) => scrubUrl(url, true),
      ),
  )
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
export function scrubEvent<T>(event: T, maxDepth = 24): T {
  const seen = new WeakSet<object>();
  function visit(value: unknown, depth: number, field = ""): unknown {
    if (depth > maxDepth) return REDACTED;
    if (typeof value === "string") return scrubText(value);
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return REDACTED;
    seen.add(value);
    if (Array.isArray(value))
      return value.map((item) => visit(item, depth + 1));
    return visitObject(value, depth, field);
  }
  function visitObject(value: object, depth: number, field: string): unknown {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // Scopes and clients are live SDK objects stripped before serialization.
      // Only the sampling context reaches the envelope's trace header.
      if (key === "sdkProcessingMetadata" && item && typeof item === "object") {
        result[key] = Object.fromEntries(
          Object.entries(item).map(([name, data]) => [
            name,
            name === "dynamicSamplingContext"
              ? visit(data, depth + 1, name)
              : data,
          ]),
        );
        continue;
      }
      if (field === "dynamicSamplingContext" && key === "public_key") {
        result[key] = item;
        continue;
      }
      if (key === "user" || key === "cookies" || key === "request_body")
        continue;
      result[key] = visitField(key, item, depth, field);
    }
    return result;
  }
  function visitField(
    key: string,
    item: unknown,
    depth: number,
    field: string,
  ): unknown {
    // rrweb stores both snapshot and mutation attributes here, including
    // srcset, CSS url(...) and inlined image/canvas data. Drop the whole value.
    if (
      field === "attributes" &&
      typeof item === "string" &&
      /(?:^|[\s("'=,])(?:data|blob):/i.test(item)
    )
      return REDACTED;
    // Sentry accepts query_string as text, an object, or pairs; drop all forms.
    if (sensitiveKey.test(key) || /^(query_string|url\.query)$/i.test(key))
      return REDACTED;
    if (key === "request" && item && typeof item === "object") {
      const { data: _data, ...request } = item as Record<string, unknown>;
      return visit(request, depth + 1);
    }
    if (
      /^(url|href|referrer|http\.url|url\.full|url\.original)$/i.test(key) &&
      typeof item === "string"
    )
      return scrubText(scrubUrl(item, true));
    return visit(item, depth + 1, key);
  }
  return visit(event, 0) as T;
}
