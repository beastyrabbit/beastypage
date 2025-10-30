export type NavAccent = "hub" | "gatcha" | "stream" | "collection" | "personal";

export type NavDefinition = {
  key: NavAccent;
  label: string;
  defaultHref: string;
  envKey?: string;
};

export type ResolvedNavItem = {
  key: NavAccent;
  label: string;
  href: string;
  defaultHref: string;
};

export const NAV_DEFINITIONS: NavDefinition[] = [
  { key: "hub", label: "Hub", defaultHref: "/", envKey: "NEXT_PUBLIC_HUB_URL" },
  { key: "gatcha", label: "Gacha", defaultHref: "/gatcha", envKey: "NEXT_PUBLIC_GATCHA_URL" },
  { key: "stream", label: "Stream Tools", defaultHref: "/stream", envKey: "NEXT_PUBLIC_STREAM_URL" },
  { key: "collection", label: "Collection", defaultHref: "/collection", envKey: "NEXT_PUBLIC_COLLECTION_URL" },
  { key: "personal", label: "Personal", defaultHref: "/personal", envKey: "NEXT_PUBLIC_PERSONAL_URL" },
];

function sanitizeHref(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fallback;
}

export function resolveNavItems(env: Record<string, string | undefined>): ResolvedNavItem[] {
  return NAV_DEFINITIONS.map((definition) => {
    const runtime = definition.envKey ? env[definition.envKey] : undefined;
    return {
      key: definition.key,
      label: definition.label,
      defaultHref: definition.defaultHref,
      href: sanitizeHref(runtime, definition.defaultHref),
    } satisfies ResolvedNavItem;
  });
}
