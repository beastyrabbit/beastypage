import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { SingleCatPlusClient, type AfterlifeOption } from "@/components/single-cat/SingleCatPlusClient";
import type { SingleCatSettings } from "@/utils/singleCatVariants";
import { parseSingleCatPayload } from "@/utils/singleCatVariants";
import { getServerConvexUrl } from "@/lib/convexUrl";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Single Cat Plus | BeastyPage",
  description: "Generate, preview, and export pixel cats with advanced timing and trait controls.",
};

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

type SingleCatPlusPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

async function loadVariantSettings(
  slug: string
): Promise<{ settings: SingleCatSettings | null; error: string | null }> {
  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return { settings: null, error: "Failed to load settings from URL" };
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const record = await convex.query(api.singleCatSettings.get, { slug });
    if (!record) {
      return { settings: null, error: "No preset found for that slug" };
    }
    if (!record.config) {
      return { settings: null, error: "Preset payload missing config" };
    }
    return { settings: parseSingleCatPayload(record.config), error: null };
  } catch (error) {
    console.error(`[SingleCatPlusPage] Failed to load settings slug="${slug}"`, error);
    return { settings: null, error: "Failed to load settings from URL" };
  }
}

export default async function SingleCatPlusPage({ searchParams }: SingleCatPlusPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const mode: "flashy" | "calm" = firstSearchParam(resolvedSearchParams.mode) === "calm" ? "calm" : "flashy";
  const accessories = parseRange(firstSearchParam(resolvedSearchParams.accessories), RANGE_FALLBACKS.accessories);
  const scars = parseRange(firstSearchParam(resolvedSearchParams.scars), RANGE_FALLBACKS.scars);
  const torties = parseRange(firstSearchParam(resolvedSearchParams.torties), RANGE_FALLBACKS.torties);
  const afterlife = parseAfterlife(firstSearchParam(resolvedSearchParams.afterlife), "dark10");
  const variantSlug =
    firstSearchParam(resolvedSearchParams.variant)?.trim() ||
    firstSearchParam(resolvedSearchParams.speed)?.trim() ||
    undefined;

  let initialVariantSettings: SingleCatSettings | null = null;
  let initialVariantLoadError: string | null = null;
  if (variantSlug) {
    const loaded = await loadVariantSettings(variantSlug);
    initialVariantSettings = loaded.settings;
    initialVariantLoadError = loaded.error;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Single Cat Plus</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
          Generate, preview, and export pixel cats in the React pipeline.
        </h1>
      </section>

      <SingleCatPlusClient
        defaultMode={mode}
        defaultAccessoryRange={accessories}
        defaultScarRange={scars}
        defaultTortieRange={torties}
        defaultAfterlife={afterlife}
        variantSlug={variantSlug}
        initialVariantSettings={initialVariantSettings}
        initialVariantLoadError={initialVariantLoadError}
      />
    </main>
  );
}
