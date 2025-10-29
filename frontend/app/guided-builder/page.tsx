import type { Metadata } from "next";

import { GuidedBuilderClient } from "@/components/guided-builder/GuidedBuilderClient";

export const metadata: Metadata = {
  title: "Guided Builder Tour",
  description: "Step-by-step wizard that walks you through building the perfect cat using the V3 renderer.",
};

export default function GuidedBuilderPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Guided Tour</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
          Build your cat one thoughtful step at a time
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-neutral-200/85 sm:text-base">
          Follow the classic guided builder flow with modern Convex storage and the FastAPI renderer.
          Every choice updates the preview instantly, and you can share the entire timeline once you are done.
        </p>
      </section>
      <GuidedBuilderClient />
    </main>
  );
}
