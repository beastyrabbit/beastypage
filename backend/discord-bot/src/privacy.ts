const REDACTED = "[Filtered]";
const SECRET =
  /token|key|secret|password|auth|code|session|signature|sig|edit|email|slug|share|imageurl/i;
const IDENTITY =
  /^(discord)?(user(id|name)?|guild(id|name)?|member|interaction(id)?)$/i;
const OMIT =
  /(^|\.)(authorization|proxy-authorization|cookie|set-cookie|cookies|body|requestbody|postdata|user)$/i;

function scrubEmails(value: string): string {
  const chunks: string[] = [];
  let copiedThrough = 0;
  // Bound each scan by an @ separator and anchor the domain match.
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

function text(value: string): string {
  return scrubEmails(
    value
      // Include outgoing Discord capability URLs as well as shared frontend links.
      // Each fixed prefix consumes its full suffix without overlapping quantifiers.
      .replace(
        /(\/(?:i|view|adoption|ancestry-tree|evolution|webhooks|interactions)\/)[^\s?#"'<>]+/g,
        `$1${REDACTED}`,
      )
      .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[Filtered]@")
      .replace(/\b\d{17,20}\b/g, REDACTED)
      .replace(/\bBearer\s+[A-Z0-9._~+/=-]+/gi, "Bearer [Filtered]")
      .replace(
        /\b(?:mfa\.[\w-]{20,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{25,110})\b/g,
        REDACTED,
      ),
  ).replace(
    /(^|[?&#;\s])([^=?&#;\s]+)=([^&#;\s"'<>]*)/g,
    (match, prefix: string, key: string) => {
      try {
        if (
          SECRET.test(decodeURIComponent(key.replaceAll("+", " "))) ||
          IDENTITY.test(key.replace(/[_-]/g, ""))
        )
          return `${prefix}${key}=${REDACTED}`;
      } catch {
        return `${prefix}${key}=${REDACTED}`;
      }
      return match;
    },
  );
}

// Return a copy so scrubbing never changes application objects or SDK input.
export function scrubTelemetry<T>(input: T): T {
  const seen = new WeakSet<object>();

  function visit(value: unknown, field = "", depth = 0): unknown {
    if (depth > 30) return REDACTED;
    if (typeof value === "string") return text(value);
    if (value && typeof value === "object") {
      if (seen.has(value)) return REDACTED;
      seen.add(value);
    }
    if (Array.isArray(value)) {
      // Python-style header/query pairs can also occur in custom breadcrumbs.
      if (field === "headers" || field === "query_string") {
        return value
          .filter((pair) => !Array.isArray(pair) || !OMIT.test(String(pair[0])))
          .map((pair) =>
            Array.isArray(pair) && SECRET.test(String(pair[0]))
              ? [pair[0], REDACTED]
              : visit(pair, "", depth + 1),
          );
      }
      return value.map((item) => visit(item, "", depth + 1));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
          // Only dynamic sampling context reaches the envelope header. Other
          // internal metadata holds live scopes/clients and is stripped by Sentry.
          if (
            key === "sdkProcessingMetadata" &&
            item &&
            typeof item === "object"
          ) {
            return [
              [
                key,
                Object.fromEntries(
                  Object.entries(item).map(([name, data]) => [
                    name,
                    name === "dynamicSamplingContext"
                      ? visit(data, name, depth + 1)
                      : data,
                  ]),
                ),
              ],
            ];
          }
          if (field === "dynamicSamplingContext" && key === "public_key")
            return [[key, item]];
          const normalized = key.replace(/[_-]/g, "").toLowerCase();
          if (
            OMIT.test(key) ||
            OMIT.test(normalized) ||
            IDENTITY.test(normalized) ||
            (field === "request" && /^(data|query|form)$/i.test(key))
          )
            return [];
          return [
            [
              text(key),
              SECRET.test(key) ? REDACTED : visit(item, key, depth + 1),
            ],
          ];
        }),
      );
    }
    return value;
  }
  return visit(input) as T;
}
