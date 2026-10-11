/**
 * Browser-local capability storage for anonymous mapper profiles.
 *
 * Mapper queries intentionally never return edit tokens. A creator can still
 * edit their anonymous profile from another tab by retaining the token that
 * the create mutation returned under a slug-scoped local-storage key.
 */
const EDIT_TOKEN_PREFIX = "beastypage:mapper-edit-token:";

function keyFor(slug: string): string {
  return `${EDIT_TOKEN_PREFIX}${slug}`;
}

export function storeMapperEditToken(slug: string, editToken: string): void {
  if (typeof window === "undefined" || !editToken) return;
  try {
    window.localStorage.setItem(keyFor(slug), editToken);
  } catch {
    // Storage can be disabled or unavailable in privacy modes. The server
    // still protects the mutation; callers simply lose cross-tab editing.
  }
}

export function readMapperEditToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyFor(slug));
  } catch {
    return null;
  }
}
