import type { Metadata } from "next";
import localFont from "next/font/local";
import { EvolutionGeneratorClient } from "@/components/evolution/EvolutionGeneratorClient";

const pixelFont = localFont({
  src: "../../fonts/pressstart2p/PressStart2P-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Press Start 2P Fallback"],
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
