"use client";

import { SingleCatPlusClient, type AfterlifeOption } from "@/components/single-cat/SingleCatPlusClient";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type RangeParam = {
  min: number;
  max: number;
};

const RANGE_FALLBACKS = {
  accessories: { min: 1, max: 4 } as RangeParam,
  scars: { min: 1, max: 1 } as RangeParam,
  torties: { min: 1, max: 4 } as RangeParam,
};

function parseRange(value: string | null, fallback: RangeParam): RangeParam {
  if (!value) return fallback;
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) return fallback;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (Number.isNaN(min) || Number.isNaN(max)) return fallback;
  if (min < 0 || max < 0 || min > max) return fallback;
  return { min, max };
}

const AFTERLIFE_OPTIONS: AfterlifeOption[] = ["off", "dark10", "star10", "both10", "darkForce", "starForce"];

function parseAfterlife(value: string | null, fallback: AfterlifeOption): AfterlifeOption {
  if (!value) return fallback;
  return AFTERLIFE_OPTIONS.includes(value as AfterlifeOption) ? (value as AfterlifeOption) : fallback;
}

function SingleCatPlusContent() {
  const searchParams = useSearchParams();
  const params = useMemo(() => {
    const mode = searchParams.get("mode") === "calm" ? "calm" : "flashy";
    const accessories = parseRange(searchParams.get("accessories"), RANGE_FALLBACKS.accessories);
    const scars = parseRange(searchParams.get("scars"), RANGE_FALLBACKS.scars);
    const torties = parseRange(searchParams.get("torties"), RANGE_FALLBACKS.torties);
    const afterlife = parseAfterlife(searchParams.get("afterlife"), "dark10");
    return { mode, accessories, scars, torties, afterlife };
  }, [searchParams]);

  return (
    <SingleCatPlusClient
      defaultMode={params.mode}
      defaultAccessoryRange={params.accessories}
      defaultScarRange={params.scars}
      defaultTortieRange={params.torties}
      defaultAfterlife={params.afterlife}
    />
  );
}

export default function SingleCatPlusPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-14 px-6 py-16">
      <section className="glass-card overflow-hidden px-8 py-10">
        <div className="section-eyebrow">Single Cat Plus</div>
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Generate, preview, and export pixel cats in the React pipeline.
        </h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">
          This is the first live port of the renderer. We&apos;re still adding layer controls, animations, and Convex-powered uploads, but you can already roll cats and export high-res PNGs.
        </p>
      </section>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading renderer…</div>}>
        <SingleCatPlusContent />
      </Suspense>
    </main>
  );
}
