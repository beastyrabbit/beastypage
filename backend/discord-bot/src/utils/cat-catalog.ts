import publicCatalogJson from "../generated/public-cat-catalog.json" with {
  type: "json",
};

export interface CatalogChoice {
  name: string;
  value: string;
}

export interface PublicCatCatalogEntry {
  id: string;
  label: string;
  spriteKey?: string;
  poses?: unknown;
  deprecated?: boolean;
  weight?: number;
}

export interface PublicCatTrait {
  id: string;
  label: string;
  order: number;
  value: {
    kind: string;
    catalog?: string;
    required: boolean;
    default?: unknown;
    maxItems?: number;
  };
  gacha?: {
    strategy?: string;
    catalog?: string;
    [key: string]: unknown;
  };
  capabilities: {
    display?: boolean;
    edit?: string;
    settings?: boolean;
    [key: string]: unknown;
  };
}

export interface PublicCatCatalog {
  catalogHash: string;
  formatVersion: number;
  schemaVersion: number;
  traits: PublicCatTrait[];
  catalogs: Record<string, PublicCatCatalogEntry[]>;
}

export type LegacyCatOption = "pelt" | "colour" | "eye_colour";

interface CompoundListBinding {
  maskCatalog: string;
  peltCatalog: string;
  colourCatalog: string;
}

interface CompoundChoiceEntry {
  id: string;
  label: string;
}

const publicCatCatalog = publicCatalogJson as unknown as PublicCatCatalog;

const legacyOptionMappings: Record<
  LegacyCatOption,
  { traitId: string; catalog?: string }
> = {
  pelt: { traitId: "pelt", catalog: "coatChoices" },
  colour: { traitId: "colour" },
  eye_colour: { traitId: "eyeColour" },
};

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toChoice(entry: { id: string; label: string }): CatalogChoice | null {
  // Discord string-choice values are limited to 100 characters. Do not
  // truncate IDs because that would silently change their registry meaning.
  if (entry.id.length > 100) return null;
  const label = entry.label || entry.id;
  return {
    name: label.length <= 100 ? label : `${label.slice(0, 99)}…`,
    value: entry.id,
  };
}

function filterChoices(
  entries: readonly { id: string; label: string; deprecated?: boolean }[],
  input: string,
): CatalogChoice[] {
  const query = normalizeSearch(input);
  return entries
    .filter(
      (entry) =>
        !entry.deprecated &&
        (!query ||
          normalizeSearch(entry.id).includes(query) ||
          normalizeSearch(entry.label).includes(query)),
    )
    .map(toChoice)
    .filter((choice): choice is CatalogChoice => choice !== null)
    .slice(0, 25);
}

function valueCatalogForTrait(trait: PublicCatTrait): string | undefined {
  // The gacha catalog is the public generation choice set. It may intentionally
  // be broader than the renderer's primitive catalog (for example coatChoices).
  return trait.gacha?.catalog ?? trait.value.catalog;
}

function compoundListBinding(
  trait: PublicCatTrait,
): CompoundListBinding | null {
  const gacha = trait.gacha;
  if (trait.value.kind !== "objectList" || gacha?.strategy !== "tortieList") {
    return null;
  }
  if (
    typeof gacha.maskCatalog !== "string" ||
    typeof gacha.peltCatalog !== "string" ||
    typeof gacha.colourCatalog !== "string"
  ) {
    return null;
  }
  return {
    maskCatalog: gacha.maskCatalog,
    peltCatalog: gacha.peltCatalog,
    colourCatalog: gacha.colourCatalog,
  };
}

function isDiscordOverrideableTrait(
  source: PublicCatCatalog,
  trait: PublicCatTrait,
): boolean {
  if (["string", "boolean", "integer", "stringList"].includes(trait.value.kind)) {
    return true;
  }
  const binding = compoundListBinding(trait);
  return Boolean(
    binding &&
      source.catalogs[binding.maskCatalog]?.length &&
      source.catalogs[binding.peltCatalog]?.length &&
      source.catalogs[binding.colourCatalog]?.length,
  );
}

function compoundChoice(
  mask: CompoundChoiceEntry,
  pattern: CompoundChoiceEntry,
  colour: CompoundChoiceEntry,
): { id: string; label: string } {
  return {
    id: JSON.stringify({
      mask: mask.id,
      pattern: pattern.id,
      colour: colour.id,
    }),
    label: `${mask.label} / ${pattern.label} / ${colour.label}`,
  };
}

function activeCatalogEntries(
  source: PublicCatCatalog,
  catalogId: string,
): CompoundChoiceEntry[] {
  return (source.catalogs[catalogId] ?? []).filter(
    (entry) => !entry.deprecated,
  );
}

function exactCompoundChoice(
  input: string,
  masks: readonly CompoundChoiceEntry[],
  patterns: readonly CompoundChoiceEntry[],
  colours: readonly CompoundChoiceEntry[],
): CatalogChoice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    !["mask", "pattern", "colour"].every((key) => keys.includes(key))
  ) {
    return null;
  }
  const mask = masks.find((entry) => entry.id === record.mask);
  const pattern = patterns.find((entry) => entry.id === record.pattern);
  const colour = colours.find((entry) => entry.id === record.colour);
  if (!mask || !pattern || !colour) return null;
  return toChoice(compoundChoice(mask, pattern, colour));
}

function compoundValueChoices(
  source: PublicCatCatalog,
  trait: PublicCatTrait,
  input: string,
): CatalogChoice[] {
  const binding = compoundListBinding(trait);
  if (!binding) return [];
  const masks = activeCatalogEntries(source, binding.maskCatalog);
  const patterns = activeCatalogEntries(source, binding.peltCatalog);
  const colours = activeCatalogEntries(source, binding.colourCatalog);
  if (!masks.length || !patterns.length || !colours.length) return [];

  const exact = exactCompoundChoice(input, masks, patterns, colours);
  if (exact) return [exact];

  const base = [masks[0], patterns[0], colours[0]] as const;
  const candidates = new Map<string, { id: string; label: string }>();
  const add = (
    mask: CompoundChoiceEntry,
    pattern: CompoundChoiceEntry,
    colour: CompoundChoiceEntry,
  ) => {
    const candidate = compoundChoice(mask, pattern, colour);
    candidates.set(candidate.id, candidate);
  };
  add(...base);
  for (const mask of masks) add(mask, base[1], base[2]);
  for (const pattern of patterns) add(base[0], pattern, base[2]);
  for (const colour of colours) add(base[0], base[1], colour);
  return filterChoices([...candidates.values()], input);
}

export function getPublicCatCatalog(): PublicCatCatalog {
  return publicCatCatalog;
}

function getTraitFromCatalog(
  source: PublicCatCatalog,
  traitId: string,
): PublicCatTrait | undefined {
  return source.traits.find((trait) => trait.id === traitId);
}

export function getCatTrait(traitId: string): PublicCatTrait | undefined {
  return getTraitFromCatalog(publicCatCatalog, traitId);
}

export function getCatTraitLabel(traitId: string): string {
  return getCatTrait(traitId)?.label ?? traitId;
}

export function getTraitChoices(
  input: string,
  options: { settingsOnly?: boolean; overrideableOnly?: boolean } = {},
): CatalogChoice[] {
  return getTraitChoicesFromCatalog(publicCatCatalog, input, options);
}

export function getTraitChoicesFromCatalog(
  source: PublicCatCatalog,
  input: string,
  options: { settingsOnly?: boolean; overrideableOnly?: boolean } = {},
): CatalogChoice[] {
  const traits = source.traits
    .filter(
      (trait) =>
        (!options.settingsOnly || trait.capabilities.settings) &&
        (!options.overrideableOnly ||
          isDiscordOverrideableTrait(source, trait)),
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  return filterChoices(traits, input);
}

export function getTraitValueChoices(
  traitId: string,
  input: string,
): CatalogChoice[] {
  return getTraitValueChoicesFromCatalog(publicCatCatalog, traitId, input);
}

export function getTraitValueChoicesFromCatalog(
  source: PublicCatCatalog,
  traitId: string,
  input: string,
): CatalogChoice[] {
  const trait = getTraitFromCatalog(source, traitId);
  if (!trait) return [];

  const catalogId = valueCatalogForTrait(trait);
  if (catalogId) {
    return filterChoices(source.catalogs[catalogId] ?? [], input);
  }

  if (trait.value.kind === "boolean") {
    return filterChoices(
      [
        { id: "true", label: "Enabled" },
        { id: "false", label: "Disabled" },
      ],
      input,
    );
  }

  if (trait.value.kind === "objectList") {
    return compoundValueChoices(source, trait, input);
  }

  return [];
}

export function getLegacyCatOptionChoices(
  option: LegacyCatOption,
  input: string,
): CatalogChoice[] {
  const mapping = legacyOptionMappings[option];
  const trait = getCatTrait(mapping.traitId);
  if (!trait) return [];
  const catalogId = mapping.catalog ?? valueCatalogForTrait(trait);
  return catalogId
    ? filterChoices(publicCatCatalog.catalogs[catalogId] ?? [], input)
    : [];
}
