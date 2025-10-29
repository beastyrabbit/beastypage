import { VisualBuilderClient, type VisualBuilderInitialPayload } from "@/components/visual-builder/VisualBuilderClient";
import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";
import { decodeCatShare } from "@/legacy/core/catShare";

type PageProps = {
  searchParams?: Promise<{
    cat?: string | string[];
    slug?: string | string[];
    name?: string | string[];
    creator?: string | string[];
  }>;
};

export default async function VisualBuilderPage({ searchParams }: PageProps) {
  const resolvedSearch = searchParams ? await searchParams : undefined;

  const rawSlug = typeof resolvedSearch?.slug === "string" ? resolvedSearch.slug : Array.isArray(resolvedSearch?.slug) ? resolvedSearch?.slug[0] : undefined;
  const rawCat = typeof resolvedSearch?.cat === "string" ? resolvedSearch.cat : Array.isArray(resolvedSearch?.cat) ? resolvedSearch?.cat[0] : undefined;
  const rawName = typeof resolvedSearch?.name === "string" ? resolvedSearch.name : Array.isArray(resolvedSearch?.name) ? resolvedSearch?.name[0] : undefined;
  const rawCreator = typeof resolvedSearch?.creator === "string" ? resolvedSearch.creator : Array.isArray(resolvedSearch?.creator) ? resolvedSearch?.creator[0] : undefined;

  const slugParam = rawSlug?.trim();
  const encoded = rawCat?.trim();

  if (slugParam && !encoded) {
    return <VisualBuilderLoader slug={slugParam} />;
  }

  let initialCat: VisualBuilderInitialPayload | null = null;

  if (encoded) {
    const decoded = decodeCatShare(encoded);
    if (decoded?.params) {
      const accessories = (decoded.accessorySlots ?? []).filter((value): value is string => !!value && value !== "none");
      const scars = (decoded.scarSlots ?? []).filter((value): value is string => !!value && value !== "none");
      const tortie = (decoded.tortieSlots ?? []).filter((entry): entry is NonNullable<typeof entry> => !!entry);
      initialCat = {
        params: decoded.params as VisualBuilderInitialPayload["params"],
        accessories: accessories.length ? accessories : undefined,
        scars: scars.length ? scars : undefined,
        tortie: tortie.length ? tortie : undefined,
        catName: rawName?.trim() || undefined,
        creatorName: rawCreator?.trim() || undefined,
      };
      if (slugParam) {
        initialCat.slug = slugParam;
        initialCat.shareUrl = `/visual-builder?slug=${encodeURIComponent(slugParam)}`;
      }
    }
  }

  return <VisualBuilderClient initialCat={initialCat} />;
}
