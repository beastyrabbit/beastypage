import type { Metadata } from "next";
import { VisualBuilderClient, DEFAULT_PARAMS, type VisualBuilderInitialPayload } from "@/components/visual-builder/VisualBuilderClient";
import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";
import { decodeCatShare } from "@/lib/catShare";

export const metadata: Metadata = {
  title: "Visual Cat Builder",
  description: "Customize and share ClanGen-style cat sprites in the visual builder.",
};

type PageProps = {
  searchParams?: Promise<{
    cat?: string | string[];
    share?: string | string[];
    slug?: string | string[];
    name?: string | string[];
    creator?: string | string[];
  }>;
};

export default async function VisualBuilderPage({ searchParams }: PageProps) {
  const resolvedSearch = searchParams ? await searchParams : undefined;

  const rawSlug = typeof resolvedSearch?.slug === "string" ? resolvedSearch.slug : Array.isArray(resolvedSearch?.slug) ? resolvedSearch?.slug[0] : undefined;
  const rawShare = typeof resolvedSearch?.share === "string" ? resolvedSearch.share : Array.isArray(resolvedSearch?.share) ? resolvedSearch?.share[0] : undefined;
  const rawCat = typeof resolvedSearch?.cat === "string" ? resolvedSearch.cat : Array.isArray(resolvedSearch?.cat) ? resolvedSearch?.cat[0] : undefined;
  const rawName = typeof resolvedSearch?.name === "string" ? resolvedSearch.name : Array.isArray(resolvedSearch?.name) ? resolvedSearch?.name[0] : undefined;
  const rawCreator = typeof resolvedSearch?.creator === "string" ? resolvedSearch.creator : Array.isArray(resolvedSearch?.creator) ? resolvedSearch?.creator[0] : undefined;

  const slugParam = rawSlug?.trim();
  const shareValue = (rawShare ?? rawCat)?.trim();

  if (slugParam && !shareValue) {
    return <VisualBuilderLoader slug={slugParam} />;
  }

  let initialCat: VisualBuilderInitialPayload | null = null;

  if (shareValue) {
    const decoded = await decodeCatShare(shareValue);
    if (decoded?.params) {
      const params = { ...DEFAULT_PARAMS, ...(decoded.params as Record<string, unknown>) } as VisualBuilderInitialPayload["params"];
      const accessories = (decoded.accessorySlots ?? []).filter((value): value is string => !!value && value !== "none");
      const scars = (decoded.scarSlots ?? []).filter((value): value is string => !!value && value !== "none");
      const tortie = (decoded.tortieSlots ?? []).filter((entry): entry is NonNullable<typeof entry> => !!entry);

      params.accessories = accessories;
      params.accessory = accessories[0] ?? undefined;
      params.scars = scars;
      params.scar = scars[0] ?? undefined;
      params.tortie = tortie as VisualBuilderInitialPayload["tortie"];
      params.isTortie = tortie.length > 0;
      if (tortie.length > 0) {
        params.tortiePattern = tortie[0]?.pattern;
        params.tortieColour = tortie[0]?.colour;
        params.tortieMask = tortie[0]?.mask;
      } else {
        params.tortiePattern = undefined;
        params.tortieColour = undefined;
        params.tortieMask = undefined;
      }

      initialCat = {
        params,
        accessories: accessories.length ? accessories : undefined,
        scars: scars.length ? scars : undefined,
        tortie: tortie.length ? tortie : undefined,
        catName: rawName?.trim() || undefined,
        creatorName: rawCreator?.trim() || undefined,
        slug: shareValue,
        shareUrl: `/visual-builder?share=${encodeURIComponent(shareValue)}`,
      };
    }
  }

  return <VisualBuilderClient initialCat={initialCat} />;
}
