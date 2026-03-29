import type { Metadata } from "next";
import { PageHero } from "@/components/common/PageHero";
import { GuidedSettingsWizard } from "@/components/cat-settings/GuidedSettingsWizard";
import { decodePortableSettings } from "@/lib/portable-settings";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Guided Settings Wizard | BeastyPage",
  description:
    "Step-by-step wizard to configure your Single Cat Plus gacha settings with visual examples and live previews.",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function GuidedSettingsPage({ searchParams }: PageProps) {
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
        title="Guided Settings Wizard"
        description="Walk through each setting step-by-step with visual examples and live previews."
      >
        <a
          href={`/single-cat-plus/settings${codeParam ? `?code=${encodeURIComponent(codeParam)}` : ""}`}
          className="rounded-lg border border-border/50 bg-background/70 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Switch to Advanced View
        </a>
      </PageHero>
      <GuidedSettingsWizard
        initialSettings={initialSettings}
        hasInitialCode={initialSettings !== null}
      />
    </main>
  );
}
