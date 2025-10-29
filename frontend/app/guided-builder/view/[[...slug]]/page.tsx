import type { Metadata } from "next";

import { GuidedTimelineViewer } from "@/components/guided-builder/GuidedTimelineViewer";

type ViewerPageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams?: { [key: string]: string | string[] | undefined };
};

export const metadata: Metadata = {
  title: "Guided Builder Timeline",
  description: "Review each step from a guided builder session and export the final sprite.",
};

export default async function GuidedBuilderViewerPage({ params, searchParams }: ViewerPageProps) {
  const resolvedParams = await params;
  const slug = Array.isArray(resolvedParams.slug) && resolvedParams.slug.length > 0 ? resolvedParams.slug[0] : null;
  const encoded = typeof searchParams?.data === "string" ? searchParams?.data : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <p className="text-xs uppercase tracking-wide text-neutral-400">Guided builder</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
          Guided timeline viewer
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-300">
          Explore each saved step, copy the build, and export the final sprite. Use the sidebar to jump
          between major trait decisions.
        </p>
      </section>
      <GuidedTimelineViewer slug={slug} encoded={encoded} />
    </main>
  );
}
