const REDACTED = "[Filtered]";
const SECRET =
  /token|key|secret|password|auth|code|session|signature|sig|edit|email/i;
const OMIT =
  /(^|\.)(authorization|proxy-authorization|cookie|set-cookie|cookies|body|requestbody|postdata|user)$/i;

// Return a copy so scrubbing never changes application objects or SDK input.
export function scrubTelemetry<T>(input: T): T {
  const seen = new WeakSet<object>();
  function text(value: string): string {
    return value
      .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[Filtered]@")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [Filtered]")
      .replace(
        /\b(?:mfa\.[\w-]{20,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{25,110})\b/g,
        REDACTED,
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
      .replace(
        /(^|[?&#;\s])([^=?&#;\s]+)=([^&#;\s"'<>]*)/g,
        (match, prefix: string, key: string) => {
          try {
            if (SECRET.test(decodeURIComponent(key.replace(/\+/g, " "))))
              return `${prefix}${key}=${REDACTED}`;
          } catch {
            return `${prefix}${key}=${REDACTED}`;
          }
          return match;
        },
      );
  }

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
