import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import { EvolutionGeneratorClient } from "@/components/evolution/EvolutionGeneratorClient";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Evolution Chamber | BeastyRabbit",
  description:
    "Place one starter cat on the altar and watch it evolve into branching elemental lines — every stage revealed live.",
  openGraph: {
    title: "Evolution Chamber",
    description:
      "Place one starter cat on the altar and watch it evolve into branching elemental lines — every stage revealed live.",
  },
};

export default function EvolutionGeneratorPage() {
  return (
    <main
      className={`${pixelFont.variable} mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 text-foreground sm:px-6 lg:px-8`}
    >
      <EvolutionGeneratorClient />
    </main>
  );
}
