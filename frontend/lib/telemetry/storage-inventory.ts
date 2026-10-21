export type StorageDeclaration = {
  name: string;
  storage: string;
  purpose: string;
  duration: string;
  category: "necessary" | "analytics";
  pattern: string;
};

/** Shared by preferences, the privacy policy, and browser storage assertions. */
export const STORAGE_INVENTORY: StorageDeclaration[] = [
  {
    name: "cc_cookie",
    storage: "Cookie",
    purpose: "Remembers your consent choices. Never used for analytics.",
    duration: "6 months",
    category: "necessary",
    pattern: "^cc_cookie$",
  },
  {
    name: "__session, __client_uat, __refresh, __clerk_*",
    storage: "Cookies",
    purpose:
      "Clerk authentication, session refresh, and sign-in security. Clerk may suffix cookie names for the application instance.",
    duration: "Session or Clerk-managed expiry",
    category: "necessary",
    pattern: "^(?:__session|__client_uat|__refresh)(?:_.*)?$|^__clerk_",
  },
  {
    name: "clerk_*, __clerk_*, __clerk_client_jwt",
    storage: "Local / session storage",
    purpose:
      "Clerk sign-in state, active context, and session coordination when authentication is used.",
    duration: "Session or until Clerk clears it",
    category: "necessary",
    pattern: "^(?:clerk_|__clerk_)",
  },
  {
    name: "singleCatPlus.variants, pixelator-variants",
    storage: "Local storage",
    purpose:
      "Tool settings and saved variants you choose to keep on this device.",
    duration: "Until removed or browser storage is cleared",
    category: "necessary",
    pattern: "^(?:singleCatPlus\\.variants|pixelator-variants)$",
  },
  {
    name: "paletteGenerator.collection",
    storage: "Local storage",
    purpose: "Your locally saved palette collection.",
    duration: "Until removed or browser storage is cleared",
    category: "necessary",
    pattern: "^paletteGenerator\\.collection$",
  },
  {
    name: "beastyrabbit.quick-share.receipts.v1",
    storage: "Local storage",
    purpose:
      "Receipts for Quick Share uploads so you can manage your submissions.",
    duration: "Until removed or browser storage is cleared",
    category: "necessary",
    pattern: "^beastyrabbit\\.quick-share\\.receipts\\.v1$",
  },
  {
    name: "beastypage:mapper-edit-token:*",
    storage: "Local storage",
    purpose:
      "Capability to edit anonymous mapper profiles you created. Treat these tokens as passwords.",
    duration: "Until browser storage is cleared",
    category: "necessary",
    pattern: "^beastypage:mapper-edit-token:",
  },
  {
    name: "ancestry-tree-edit:*",
    storage: "Local / session storage",
    purpose: "Capability to edit your anonymous ancestry trees.",
    duration: "Tab session / until browser storage is cleared",
    category: "necessary",
    pattern: "^ancestry-tree-edit:",
  },
  {
    name: "stream-viewer-session, stream-viewer-session:*",
    storage: "Local / session storage",
    purpose:
      "Keeps your stream participation session and prevents duplicate signups.",
    duration: "Tab session / until browser storage is cleared",
    category: "necessary",
    pattern: "^stream-viewer-session(?::.*)?$",
  },
  {
    name: "classic-wheel:client-key, catdex-upload:client-key",
    storage: "Local storage",
    purpose: "Maintains your wheel participation and upload progress.",
    duration: "Until browser storage is cleared",
    category: "necessary",
    pattern: "^(?:classic-wheel|catdex-upload):client-key$",
  },
  {
    name: "umami.disabled",
    storage: "Local storage, read only",
    purpose:
      "Optional Umami opt-out switch. BeastyPage and the tracker do not create this key. Analytics, replay and heatmaps otherwise keep session state in memory and set no cookies.",
    duration: "Until you remove it",
    category: "analytics",
    pattern: "^umami\\.disabled$",
  },
];

export function isDeclaredStorageKey(key: string): boolean {
  return STORAGE_INVENTORY.some((item) => new RegExp(item.pattern).test(key));
}
