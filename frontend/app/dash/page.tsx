import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { DashSettings } from "@/lib/dash/types";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { parseDashPayload } from "@/utils/dashVariants";
import { DashClient } from "@/components/dash/DashClient";

export const metadata: Metadata = {
  title: "Dash | BeastyPage",
  description: "Your customizable dashboard — pin your favourite tools and stay up to date.",
};

export const dynamic = "force-dynamic";

type DashPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

async function loadDashFromSlug(
  slug: string
): Promise<{ settings: DashSettings | null; error: string | null }> {
  const convexUrl = getServerConvexUrl();
  if (!convexUrl) {
    return { settings: null, error: "Failed to load shared dashboard" };
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const record = await convex.query(api.dashSettings.get, { slug });
    if (!record) {
      return { settings: null, error: "Shared dashboard not found" };
    }
    if (!record.config) {
      return { settings: null, error: "Shared dashboard has no configuration" };
    }
    return { settings: parseDashPayload(record.config), error: null };
  } catch (error) {
    console.error(`[DashPage] Failed to load dashboard slug="${slug}"`, error);
    return { settings: null, error: "Failed to load shared dashboard" };
  }
}

export default async function DashPage({ searchParams }: DashPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const slug = firstSearchParam(resolvedSearchParams.slug)?.trim() || null;

  let initialSettings: DashSettings | null = null;
  let initialLoadError: string | null = null;
  if (slug) {
    const loaded = await loadDashFromSlug(slug);
    initialSettings = loaded.settings;
    initialLoadError = loaded.error;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <DashClient
        initialSlug={slug}
        initialSettings={initialSettings}
        initialLoadError={initialLoadError}
      />
    </main>
  );
}
