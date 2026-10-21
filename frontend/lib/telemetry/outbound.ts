/** Report only a public host. Never report full URLs or link text. */
export function outboundHost(
  target: EventTarget | null,
  origin: string,
): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!link) return null;
  try {
    const url = new URL(link.getAttribute("href") ?? "", origin);
    return ["https:", "http:"].includes(url.protocol) && url.origin !== origin
      ? url.hostname
      : null;
  } catch {
    return null;
  }
}
