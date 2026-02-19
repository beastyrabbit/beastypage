import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHero } from "@/components/common/PageHero";
import { ColorPaletteContent } from "@/components/color-palette/ColorPaletteContent";

export const metadata: Metadata = {
  title: "Color Palette Creator | Projects | BeastyRabbit",
  description:
    "Extract dominant colors from any image. Upload an image and generate beautiful color palettes with interactive crosshairs and hover highlighting.",
  openGraph: {
    title: "Color Palette Creator | Projects",
    description:
      "Extract dominant colors from any image. Upload an image and generate beautiful color palettes.",
  },
};

type ColorPaletteCreatorPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function ColorPaletteCreatorPage({ searchParams }: ColorPaletteCreatorPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const slug = firstSearchParam(resolvedSearchParams.slug)?.trim() ?? null;
  const darkForestParam = firstSearchParam(resolvedSearchParams.darkForest)?.trim() ?? null;
  const imageUrl = firstSearchParam(resolvedSearchParams.imageUrl) ?? null;
  const paletteSlug = firstSearchParam(resolvedSearchParams.paletteSlug)?.trim() ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Artist Tools"
        title={
          <>
            Color{" "}
            <span className="text-gradient-artist animate-shimmer bg-[length:200%_auto]">
              Palette
            </span>{" "}
            Creator
          </>
        }
        description="Extract dominant colors from any image. Drag crosshairs to pick new colors, hover swatches to highlight matching regions."
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <ColorPaletteContent
          slug={slug}
          darkForestParam={darkForestParam}
          imageUrl={imageUrl}
          paletteSlug={paletteSlug}
        />
      </Suspense>
    </main>
  );
}
