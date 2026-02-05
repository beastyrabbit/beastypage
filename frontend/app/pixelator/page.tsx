import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHero } from "@/components/common/PageHero";
import { PixelatorClient } from "@/components/pixelator/PixelatorClient";

export const metadata: Metadata = {
  title: "Pixelator | Artist Tools | BeastyRabbit",
  description:
    "Transform images with a modular pixel art pipeline. Chain pixelation, dithering, color quantization and more.",
  openGraph: {
    title: "Pixelator | Artist Tools",
    description:
      "Transform images with a modular pixel art pipeline.",
  },
};

export default function PixelatorPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Artist Tools"
        title={
          <>
            <span className="text-gradient-artist animate-shimmer bg-[length:200%_auto]">
              Pixelator
            </span>
          </>
        }
        description="Build a processing pipeline to transform images. Chain pixelation, dithering, color quantization, and effects."
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <PixelatorClient />
      </Suspense>
    </main>
  );
}
