import type { Metadata } from "next";
import { AdoptionGeneratorClient } from "@/components/adoption/AdoptionGeneratorClient";
import { PageHero } from "@/components/common/PageHero";

export const metadata: Metadata = {
  title: "Adoption Generator | BeastyRabbit",
  description: "Roll full litters, trim every reveal, and save the finalists with a shareable link.",
  openGraph: {
    title: "Adoption Generator",
    description: "Roll full litters, trim every reveal, and save the finalists with a shareable link.",
  },
};

export default function AdoptionGeneratorPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Adoption Generator"
        title="Roll, trim, and save entire litters"
        description="Queue bulk cats, customise each reveal, and lock finalists with a single shareable token."
      />

      <div className="overflow-hidden rounded-3xl border border-border/40 bg-slate-950/90 shadow-lg shadow-black/30">
        <AdoptionGeneratorClient />
      </div>
    </main>
  );
}
