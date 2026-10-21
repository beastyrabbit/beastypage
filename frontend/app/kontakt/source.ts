export const CONTACT_SOURCE_SLUGS = [
  "beastyrabbit",
  "ninelives",
  "moddrop",
  "schaffa",
  "beasty-arr",
  "homedash",
  "inbox-walk",
  "infinitune",
  "paperless-llm",
  "bytefleet",
] as const;

export type ContactSource = (typeof CONTACT_SOURCE_SLUGS)[number];

export function contactSource(value: unknown): ContactSource | undefined {
  return CONTACT_SOURCE_SLUGS.find((slug) => slug === value);
}
