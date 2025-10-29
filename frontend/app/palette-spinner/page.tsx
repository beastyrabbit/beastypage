import { PaletteSpinnerClient } from "@/components/palette/PaletteSpinnerClient";

export default function PaletteSpinnerPage() {
  return (
    <main className="min-h-screen bg-[#090b13] text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_60%_at_15%_10%,rgba(253,230,138,0.12),transparent),radial-gradient(55%_60%_at_85%_0%,rgba(59,130,246,0.12),transparent)]" />
      <PaletteSpinnerClient />
    </main>
  );
}
