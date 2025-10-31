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
    const speed = searchParams.get("speed")?.trim() || undefined;
    return { mode, accessories, scars, torties, afterlife, speed };
  }, [searchParams]);

  return (
    <SingleCatPlusClient
      defaultMode={params.mode}
      defaultAccessoryRange={params.accessories}
      defaultScarRange={params.scars}
      defaultTortieRange={params.torties}
      defaultAfterlife={params.afterlife}
      speedSlug={params.speed}
    />
  );
}

export default function SingleCatPlusPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Single Cat Plus</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
          Generate, preview, and export pixel cats in the React pipeline.
        </h1>
      </section>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading renderer…</div>}>
        <SingleCatPlusContent />
      </Suspense>
    </main>
  );
}
