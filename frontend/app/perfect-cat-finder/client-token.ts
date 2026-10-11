/**
 * Create a client identity for one Perfect Cat page instance.
 *
 * This deliberately stays in memory. Persisting the value in localStorage
 * makes two tabs share one pending matchup, so loading a matchup in one tab
 * invalidates the vote currently displayed in the other tab.
 */
export function createPerfectCatClientId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const values = cryptoApi.getRandomValues(new Uint32Array(4));
    return Array.from(values, (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("-");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
