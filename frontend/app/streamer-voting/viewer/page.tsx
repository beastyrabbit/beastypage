import ViewerClient from "@/components/streamer/ViewerClient";
import { Suspense } from "react";

export const metadata = {
  title: "Streamer Voting Viewer",
  description: "Participate in live cat builder voting sessions.",
};

type StreamerViewerPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function StreamerViewerPage({ searchParams }: StreamerViewerPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const viewerKey = firstSearchParam(resolvedSearchParams.viewer)?.trim() ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
      <Suspense fallback={<div className="rounded-3xl border border-border/40 bg-background/70 px-6 py-10 text-sm text-muted-foreground">Loading viewer panel…</div>}>
        <ViewerClient viewerKey={viewerKey} />
      </Suspense>
    </main>
  );
}
