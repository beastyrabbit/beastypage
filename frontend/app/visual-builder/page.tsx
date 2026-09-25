import type { Metadata } from "next";
import {
  DEFAULT_PARAMS,
  VisualBuilderClient,
  type VisualBuilderInitialPayload,
} from "@/components/visual-builder/VisualBuilderClient";
import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";
import { decodeCatShare } from "@/lib/catShare";

export const metadata: Metadata = {
  title: "Visual Cat Builder",
  description:
    "Customize and share ClanGen-style cat sprites in the visual builder.",
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

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function VisualBuilderPage({
  searchParams,
}: Readonly<PageProps>) {
  const resolvedSearch = searchParams ? await searchParams : undefined;

  const rawSlug = firstParam(resolvedSearch?.slug);
  const rawShare = firstParam(resolvedSearch?.share);
  const rawCat = firstParam(resolvedSearch?.cat);
  const rawName = firstParam(resolvedSearch?.name);
  const rawCreator = firstParam(resolvedSearch?.creator);

  const slugParam = rawSlug?.trim();
  const shareValue = (rawShare ?? rawCat)?.trim();

  if (slugParam && !shareValue) {
    return <VisualBuilderLoader slug={slugParam} />;
  }

  let initialCat: VisualBuilderInitialPayload | null = null;

  if (shareValue) {
    const decoded = await decodeCatShare(shareValue);
    if (decoded?.params) {
      const params = {
        ...DEFAULT_PARAMS,
        ...(decoded.params as Record<string, unknown>),
      } as VisualBuilderInitialPayload["params"];
      const accessories = (decoded.accessorySlots ?? []).filter(
        (value): value is string => !!value && value !== "none",
      );
      const scars = (decoded.scarSlots ?? []).filter(
        (value): value is string => !!value && value !== "none",
      );
      const tortie = (decoded.tortieSlots ?? []).filter(
        (entry): entry is NonNullable<typeof entry> => !!entry,
      );

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
