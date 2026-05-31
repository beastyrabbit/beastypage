import type { Metadata } from "next";
import { PageHero } from "@/components/common/PageHero";
import { EvolutionGeneratorClient } from "@/components/evolution/EvolutionGeneratorClient";

export const metadata: Metadata = {
  title: "Evolution Lines | BeastyRabbit",
  description:
    "Branch one starter cat into layered evolution lines with torties, scars, and accessories.",
  openGraph: {
    title: "Evolution Lines",
    description:
      "Branch one starter cat into layered evolution lines with torties, scars, and accessories.",
  },
};

export default function EvolutionGeneratorPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Evolution Lines"
        title="Branch one cat into evolution lines"
        description="Start clean or load a saved cat, then build cumulative evolution paths with new tortie forms, scars, and accessories."
      />

      <EvolutionGeneratorClient />
    </main>
  );
}
