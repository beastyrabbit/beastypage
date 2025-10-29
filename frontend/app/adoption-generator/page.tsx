import { AdoptionGeneratorClient } from "@/components/adoption/AdoptionGeneratorClient";

export const metadata = {
  title: "Adoption Generator",
};

export default function AdoptionGeneratorPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Adoption Generator</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Roll, trim, and save entire litters</h1>
      </section>

      <div className="overflow-hidden rounded-3xl border border-border/40 bg-slate-950/90 shadow-lg shadow-black/30">
        <AdoptionGeneratorClient />
      </div>
    </main>
  );
}
