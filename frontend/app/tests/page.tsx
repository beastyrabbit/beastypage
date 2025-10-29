import Link from "next/link";

export default function TestsLanding() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="theme-hero px-8 py-12 text-balance">
        <div className="section-eyebrow">Sandbox & QA</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl md:text-6xl">Test Pages & Feature Experiments</h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          Lightweight environments for trying out new pipeline steps, UI treatments, and renderer tweaks before they roll into the main gatcha flow.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-amber-400/15 via-transparent to-rose-500/15" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">Renderer Stress Harness</span>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-400">Reliability</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Fire controlled bursts against <code>/api/renderer</code>, monitor retries, and verify the queue / circuit breaker behaviour from the browser.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/tests/renderer-stress"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open stress test
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-rose-400/10" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">Snapshot Runner</span>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary">Sample</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this slot to wire up a quick renderer check, API call, or QA checklist. Duplicate the card to add more experiments.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/gatcha"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Back to Gatcha
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-blue-400/15 via-transparent to-purple-400/15" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">Layer Debugger</span>
            <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] font-semibold text-blue-400">Sprites</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Flip through every V3 layer image, recompose with blend modes on/off, and spot exactly where CatGenerator V2 diverges from the backend.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/dev/render-debug"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Inspect layers
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-emerald-400/15 via-transparent to-sky-400/15" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">CatGen V3 Lab</span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-400">Renderer</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Run the backend renderer beside catGeneratorV2, collect pixel diffs, and inspect per-layer timings while you tweak Lifegen parity.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/dev/cat-v3"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Open parity lab
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-indigo-400/15 via-transparent to-amber-400/15" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">Random Distribution Lab</span>
            <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-[11px] font-semibold text-indigo-300">Stats</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Generate 10k–100k cats with both generators, flip between weighted and uniform multi-layer odds, and spot distribution drifts before they reach production.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/dev/random-distribution"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Compare generators
            </Link>
          </div>
        </div>

        <div className="glass-card relative flex h-full flex-col gap-4 rounded-3xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-teal-400/15 via-transparent to-lime-400/15" aria-hidden />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/60">
            <span className="font-semibold text-foreground">Sprite Asset Explorer</span>
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-[11px] font-semibold text-teal-300">Sprites</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse every sprite group bundled with V3, inspect all 21 frames, and confirm new genemod, border, and missing-part assets without diving into the sheet manually.
          </p>
          <div className="mt-auto flex gap-2 text-xs">
            <Link
              href="/dev/sprite-explorer"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 font-semibold text-foreground transition hover:bg-foreground hover:text-background"
            >
              Inspect sprites
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
