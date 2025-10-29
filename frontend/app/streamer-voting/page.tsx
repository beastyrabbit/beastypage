import HostClient from "@/components/streamer/HostClient";
import { Suspense } from "react";

export const metadata = {
  title: "Streamer Voting Build",
  description: "Run live cat builder sessions with audience voting.",
};

export default function StreamerVotingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
      <Suspense fallback={<div className="rounded-3xl border border-border/40 bg-background/70 px-6 py-10 text-sm text-muted-foreground">Loading stream control center…</div>}>
        <HostClient />
      </Suspense>
    </main>
  );
}
