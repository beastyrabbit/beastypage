import type { Metadata } from "next";
import { PaletteGeneratorClient } from "@/components/palette/PaletteGeneratorClient";

export const metadata: Metadata = {
  title: "Palette Generator | BeastyPage",
  description:
    "Generate harmonious color palettes instantly. Build a collection, export as PNG, ACO, JSON, or CSS, and save your settings.",
};

export default function PaletteGeneratorPage() {
  return (
    <main className="min-h-screen bg-[#090b13] text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_60%_at_15%_10%,rgba(253,230,138,0.12),transparent),radial-gradient(55%_60%_at_85%_0%,rgba(59,130,246,0.12),transparent)]" />
      <PaletteGeneratorClient />
    </main>
  );
}
