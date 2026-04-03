import type { Metadata } from "next";
import { CatSettingsClient } from "@/components/cat-settings/CatSettingsClient";
import { PageHero } from "@/components/common/PageHero";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import { decodePortableSettings } from "@/lib/portable-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cat Settings | BeastyPage",
  description:
    "Configure and share cat generation presets with a 6-word code. Set layer counts, afterlife effects, and colour palettes.",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function CatSettingsPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : {};
  const codeParam = firstParam(resolved.code)?.trim() ?? null;

  let initialSettings: SingleCatPortableSettings | null = null;
  if (codeParam) {
    initialSettings = decodePortableSettings(codeParam);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Single Cat Plus"
        title="Cat Settings"
        description="Configure and share cat generation presets with a 6-word code."
      />
      <CatSettingsClient
        initialSettings={initialSettings}
        initialCode={codeParam}
      />
    </main>
  );
}
