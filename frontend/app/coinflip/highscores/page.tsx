"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Trophy } from "lucide-react";
import ArrowBackIcon from "@/components/ui/arrow-back-icon";

const MAX_RESULTS = 200;

export default function CoinflipHighscoresPage() {
  const rawScores = useQuery(api.coinflipper.listScores, { limit: MAX_RESULTS });

  const rows = useMemo(() => {
    const list = rawScores ?? [];
    return list.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }, [rawScores]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-4">
        <Link href="/coinflip" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowBackIcon size={16} /> Back to game
        </Link>
        <div>
          <span className="section-eyebrow">Coinflip Challenge</span>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Global leaderboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Top streaks submitted from the coinflip challenge. Scores are sorted by streak length, then by newest submissions.
          </p>
        </div>
      </header>

      <section className="glass-card overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-6 py-4">
          <Trophy className="size-5 text-amber-500" />
          <span className="text-lg font-semibold">Top {rows.length} streaks</span>
        </header>
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="text-left">
                <th className="px-6 py-3 font-semibold text-muted-foreground">Rank</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground">Name</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground">Streak</th>
                <th className="px-6 py-3 font-semibold text-muted-foreground">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No scores yet. Play a run to claim the first spot!
                  </td>
                </tr>
              ) : (
                rows.map((entry) => (
                  <tr key={entry.id} className="border-t border-border/40">
                    <td className="px-6 py-3 font-medium">#{entry.rank}</td>
                    <td className="px-6 py-3">{entry.name}</td>
                    <td className="px-6 py-3 font-semibold">{entry.score}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatTimestamp(entry.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function formatTimestamp(value: number) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}
