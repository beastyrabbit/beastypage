export type StorageDeclaration = {
  group: "consent" | "clerk" | "features";
  name: string;
  storage: string;
  purpose: string;
  duration: string;
  category: "necessary" | "analytics";
  pattern: string;
};

export const CONSENT_RETENTION_DAYS = 182;

function featureStorage(
  name: string,
  purpose: string,
  pattern: string,
  {
    storage = "Local storage",
    duration = "Until removed or browser storage is cleared",
  } = {},
): StorageDeclaration {
  return {
    group: "features",
    name,
    storage,
    purpose,
    duration,
    category: "necessary",
    pattern,
  };
}

/** Detailed declarations for consent preferences and browser storage assertions. */
export const STORAGE_INVENTORY: StorageDeclaration[] = [
  {
    group: "consent",
    name: "cc_cookie",
    storage: "Cookie",
    purpose: "Remembers your consent choices. Never used for analytics.",
    duration: `${CONSENT_RETENTION_DAYS} days`,
    category: "necessary",
    pattern: "^cc_cookie$",
  },
  {
    group: "clerk",
    name: "__session, __client, __client_uat, __refresh, __clerk_*",
    storage: "Cookies",
    purpose:
      "Clerk authentication, session refresh, and sign-in security. Clerk may suffix cookie names for the application instance.",
    duration: "Session or Clerk-managed expiry",
    category: "necessary",
    pattern:
      "^(?:__session|__client|__client_uat|__refresh)(?:_.*)?$|^__clerk_",
  },
  {
    group: "clerk",
    name: "__cf_bm, _cfuvid",
    storage: "Cookies on clerk.beastyrabbit.com",
    purpose: "Cloudflare bot protection for Clerk sign-in and account access.",
    duration: "__cf_bm: about 30 minutes; _cfuvid: session",
    category: "necessary",
    pattern: "^(?:__cf_bm|_cfuvid)$",
  },
  {
    group: "clerk",
    name: "clerk_*, __clerk_*, __clerk_client_jwt, __clerk_environment",
    storage: "Local / session storage",
    purpose:
      "Clerk sign-in state, active context, and session coordination when authentication is used.",
    duration: "Session or until Clerk clears it",
    category: "necessary",
    pattern: "^(?:clerk_|__clerk_)",
  },
  featureStorage(
    "singleCatPlus.variants, pixelator-variants",
    "Tool settings and saved variants you choose to keep on this device.",
    String.raw`^(?:singleCatPlus\.variants|pixelator-variants)$`,
  ),
  featureStorage(
    "paletteGenerator.collection",
    "Your locally saved palette collection.",
    String.raw`^paletteGenerator\.collection$`,
  ),
  featureStorage(
    "beastyrabbit.quick-share.receipts.v1",
    "Receipts for Quick Share uploads so you can manage your submissions.",
    String.raw`^beastyrabbit\.quick-share\.receipts\.v1$`,
  ),
  featureStorage(
    "beastypage:mapper-edit-token:*",
    "Capability to edit anonymous mapper profiles you created. Treat these tokens as passwords.",
    "^beastypage:mapper-edit-token:",
    { duration: "Until browser storage is cleared" },
  ),
  featureStorage(
    "ancestry-tree-edit:*",
    "Capability to edit your anonymous ancestry trees.",
    "^ancestry-tree-edit:",
    {
      storage: "Local / session storage",
      duration: "Tab session / until browser storage is cleared",
    },
  ),
  featureStorage(
    "stream-viewer-session, stream-viewer-session:fingerprint, stream-viewer-session:*",
    "Keeps your stream participation session and prevents duplicate signups.",
    "^stream-viewer-session(?::.*)?$",
    {
      storage: "Local / session storage",
      duration: "Tab session / until browser storage is cleared",
    },
  ),
  featureStorage(
    "classic-wheel:client-key, catdex-upload:client-key",
    "Maintains your wheel participation and upload progress.",
    "^(?:classic-wheel|catdex-upload):client-key$",
    { duration: "Until browser storage is cleared" },
  ),
];

export function isDeclaredStorageKey(key: string): boolean {
  return STORAGE_INVENTORY.some((item) => new RegExp(item.pattern).test(key));
}
