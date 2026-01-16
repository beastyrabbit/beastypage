import type { Metadata } from "next";

import { PageHero } from "@/components/common/PageHero";
import { ColorPaletteClient } from "@/components/color-palette/ColorPaletteClient";

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

export default function ColorPaletteCreatorPage() {
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

      <ColorPaletteClient />
    </main>
  );
}
