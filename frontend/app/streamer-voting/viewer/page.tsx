import ViewerClient from "@/components/streamer/ViewerClient";
import { Suspense } from "react";

export const metadata = {
  title: "Streamer Voting Viewer",
  description: "Participate in live cat builder voting sessions.",
};

export default function StreamerViewerPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
      <Suspense fallback={<div className="rounded-3xl border border-border/40 bg-background/70 px-6 py-10 text-sm text-muted-foreground">Loading viewer panel…</div>}>
        <ViewerClient />
      </Suspense>
    </main>
  );
}
