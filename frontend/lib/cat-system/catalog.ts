import publicCatalogJson from "@/public/cat-system/public-cat-catalog.json";
import type {
  CatalogElementDefinition,
  TraitConsumerCapabilities,
  TraitValueKind,
} from "./definition";
import { getCatTraitDefinition } from "./runtime";

export interface PublicCatCatalogElement extends CatalogElementDefinition {
  label: string;
}

export interface PublicCatTrait {
  id: string;
  label: string;
  description?: string;
  order: number;
  value: {
    kind: TraitValueKind;
    required: boolean;
    default?: unknown;
    catalog?: string;
    maxItems?: number;
    unique?: boolean;
  };
  capabilities: TraitConsumerCapabilities;
  gacha?: { strategy: string; catalog?: string };
  renderOperations: string[];
}

export interface PublicCatCatalog {
  formatVersion: 1;
  schemaVersion: number;
  catalogHash: string;
  traits: PublicCatTrait[];
  catalogs: Record<string, PublicCatCatalogElement[]>;
}

export const publicCatCatalog = publicCatalogJson as PublicCatCatalog;

export type TraitEditorCatalogSource = Pick<
  PublicCatCatalog,
  "traits" | "catalogs"
>;

type CatalogSource<TElement extends CatalogElementDefinition> = {
  catalogs: Readonly<Record<string, readonly TElement[] | undefined>>;
};

const publicTraitById = new Map(
  publicCatCatalog.traits.map((trait) => [trait.id, trait] as const),
);

export function getPublicCatTrait(traitId: string): PublicCatTrait | undefined {
  const definition = getCatTraitDefinition(traitId);
  return definition ? publicTraitById.get(definition.id) : undefined;
}

export function getCatalogElements(
  catalogId: string,
  pose?: string,
): PublicCatCatalogElement[] {
  return getCatalogElementsFromCatalog(publicCatCatalog, catalogId, pose);
}

export function getCatalogElementsFromCatalog(
  source: CatalogSource<PublicCatCatalogElement>,
  catalogId: string,
  pose?: string,
): PublicCatCatalogElement[] {
  const elements = source.catalogs[catalogId] ?? [];
  if (!pose) return [...elements];
  return elements.filter(
    (element) => !element.poses || element.poses.includes(pose),
  );
}

/**
 * Returns values that may be offered for a new choice. Canonical catalog
 * access deliberately keeps deprecated entries so existing cats remain
 * displayable and valid.
 */
export function getSelectableCatalogElements(
  catalogId: string,
  pose?: string,
): PublicCatCatalogElement[] {
  return getSelectableCatalogElementsFromCatalog(
    publicCatCatalog,
    catalogId,
    pose,
  );
}

export function getSelectableCatalogElementsFromCatalog<
  TElement extends CatalogElementDefinition,
>(
  source: CatalogSource<TElement>,
  catalogId: string,
  pose?: string,
): TElement[] {
  const elements = source.catalogs[catalogId] ?? [];
  return elements.filter(
    (element) =>
      element.deprecated !== true &&
      (!pose || !element.poses || element.poses.includes(pose)),
  );
}

export function getTraitCatalogElements(
  traitId: string,
  pose?: string,
): PublicCatCatalogElement[] {
  const trait = getPublicCatTrait(traitId);
  return trait
    ? getTraitCatalogElementsFromCatalog(publicCatCatalog, trait, pose)
    : [];
}

export function getSelectableTraitCatalogElements(
  traitId: string,
  pose?: string,
): PublicCatCatalogElement[] {
  const trait = getPublicCatTrait(traitId);
  return trait
    ? getSelectableTraitCatalogElementsFromCatalog(
        publicCatCatalog,
        trait,
        pose,
      )
    : [];
}

export function getTraitCatalogElementsFromCatalog(
  source: CatalogSource<PublicCatCatalogElement>,
  trait: Pick<PublicCatTrait, "value" | "gacha">,
  pose?: string,
): PublicCatCatalogElement[] {
  const catalogId = trait?.value.catalog ?? trait?.gacha?.catalog;
  return catalogId
    ? getCatalogElementsFromCatalog(source, catalogId, pose)
    : [];
}

export function getSelectableTraitCatalogElementsFromCatalog<
  TElement extends CatalogElementDefinition,
>(
  source: CatalogSource<TElement>,
  trait: Pick<PublicCatTrait, "value" | "gacha">,
  pose?: string,
): TElement[] {
  const catalogId = trait.value.catalog ?? trait.gacha?.catalog;
  return catalogId
    ? getSelectableCatalogElementsFromCatalog(source, catalogId, pose)
    : [];
}

export interface TraitEditorDefinition {
  traitId: string;
  label: string;
  description?: string;
  kind: Exclude<TraitConsumerCapabilities["edit"], false>;
  valueKind: TraitValueKind;
  required: boolean;
  maxItems?: number;
  options: PublicCatCatalogElement[];
}

export function getTraitEditorDefinitionsFromCatalog(
  source: TraitEditorCatalogSource,
  pose?: string,
): TraitEditorDefinition[] {
  return source.traits
    .filter(
      (
        trait,
      ): trait is PublicCatTrait & {
        capabilities: TraitConsumerCapabilities & {
          edit: Exclude<TraitConsumerCapabilities["edit"], false>;
        };
      } => trait.capabilities.edit !== false,
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    )
    .map((trait) => ({
      traitId: trait.id,
      label: trait.label,
      description: trait.description,
      kind: trait.capabilities.edit,
      valueKind: trait.value.kind,
      required: trait.value.required,
      maxItems: trait.value.maxItems,
      options: (() => {
        const catalogId = trait.value.catalog ?? trait.gacha?.catalog;
        return catalogId
          ? getSelectableCatalogElementsFromCatalog(source, catalogId, pose)
          : [];
      })(),
    }));
}

export function getTraitEditorDefinitions(
  pose?: string,
): TraitEditorDefinition[] {
  return getTraitEditorDefinitionsFromCatalog(publicCatCatalog, pose);
}
