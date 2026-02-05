"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { ScoreRecord } from "@/convex/coinflipper";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Trophy } from "lucide-react";
import RefreshIcon from "@/components/ui/refresh-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import Link from "next/link";

const FLIP_DURATION_MS = 1200;
const MAX_NAME_LENGTH = 12;

type FlipSide = "heads" | "tails";

type GameState = "ready" | "flipping" | "lost";

type LeaderboardEntry = ScoreRecord;
type LeaderboardRow = LeaderboardEntry & { placeholder?: boolean };

const FACE_LABELS: Record<FlipSide, string> = {
  heads: "Heads",
  tails: "Tails"
};

export default function CoinflipPage() {
  const rawLeaderboard = useQuery(api.coinflipper.leaderboard, { limit: 10 });
  const submitScore = useMutation(api.coinflipper.submitScore);

  const [gameState, setGameState] = useState<GameState>("ready");
  const [currentScore, setCurrentScore] = useState(0);
  const [lastChoice, setLastChoice] = useState<FlipSide | null>(null);
  const [lastResult, setLastResult] = useState<FlipSide | null>(null);
  const [displayFace, setDisplayFace] = useState<FlipSide>("heads");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [flipSeed, setFlipSeed] = useState(0);

  const displayLeaderboard = useMemo<LeaderboardRow[]>(() => {
    const rows = (rawLeaderboard ?? []).map((entry) => ({ ...entry, placeholder: false }));
    const desiredLength = 10;
    for (let index = rows.length; index < desiredLength; index += 1) {
      rows.push({
        id: `placeholder-${index}`,
        name: "Dummy",
        score: 0,
        createdAt: 0,
        placeholder: true
      });
    }
    return rows;
  }, [rawLeaderboard]);

  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flipTimerRef.current) {
        clearTimeout(flipTimerRef.current);
      }
    };
  }, []);

  const resetRun = useCallback(() => {
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }
    setGameState("ready");
    setCurrentScore(0);
    setLastChoice(null);
    setLastResult(null);
    setSubmitError(null);
    setScoreSubmitted(false);
    setNameInput("");
  }, []);

  const startFlip = useCallback(
    (choice: FlipSide) => {
      if (gameState === "flipping") return;
      if (gameState === "lost") {
        resetRun();
      }

      setLastChoice(choice);
      setGameState("flipping");
      setScoreSubmitted(false);
      setSubmitError(null);
      setFlipSeed((value) => value + 1);
      track("coinflip_call_made", { call: choice });

      const outcome: FlipSide = Math.random() < 0.5 ? "heads" : "tails";

      if (flipTimerRef.current) {
        clearTimeout(flipTimerRef.current);
      }

      flipTimerRef.current = setTimeout(() => {
        setDisplayFace(outcome);
        setLastResult(outcome);
        if (outcome === choice) {
          setCurrentScore((value) => {
            const newStreak = value + 1;
            track("coinflip_won", { streak: newStreak });
            return newStreak;
          });
          setGameState("ready");
        } else {
          track("coinflip_lost", { final_streak: currentScore });
          setGameState("lost");
        }
        flipTimerRef.current = null;
      }, FLIP_DURATION_MS);
    },
    [currentScore, gameState, resetRun]
  );

  const handleSubmitScore = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (currentScore <= 0 || isSubmitting) return;
      const name = nameInput.trim();
      if (!name) {
        setSubmitError("Enter a name to record your streak.");
        return;
      }
      if (name.length > MAX_NAME_LENGTH) {
        setSubmitError(`Name must be ${MAX_NAME_LENGTH} characters max.`);
        return;
      }
      try {
        setIsSubmitting(true);
        setSubmitError(null);
        await submitScore({ name, score: currentScore });
        setScoreSubmitted(true);
        track("coinflip_score_submitted", { score: currentScore, name_length: name.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to submit score.";
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentScore, isSubmitting, nameInput, submitScore]
  );

  const statusMessage = useMemo(() => {
    if (gameState === "flipping") {
      return "Flipping the coin…";
    }
    if (gameState === "lost") {
      if (!lastResult || !lastChoice) {
        return "Run over.";
      }
      return lastResult === lastChoice
        ? ""
        : `You guessed ${FACE_LABELS[lastChoice]} but the coin landed on ${FACE_LABELS[lastResult]}.`;
    }
    if (lastResult && lastChoice && lastResult === lastChoice) {
      return `Nice! It landed on ${FACE_LABELS[lastResult]}.`;
    }
    return "Call Heads or Tails to start your streak.";
  }, [gameState, lastChoice, lastResult]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Coinflip Challenge</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Predict the flip, stack the streak</h1>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="glass-card flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-foreground">
              <SparklesIcon size={20} />
              <span className="text-lg font-semibold">Current streak</span>
            </div>
            <span className="rounded-full bg-primary px-4 py-1 text-lg font-bold text-primary-foreground">
              {currentScore}
            </span>
          </div>

          <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
            <CoinDisplay face={displayFace} animate={gameState === "flipping"} seed={flipSeed} />
          </div>

          <p className="text-center text-sm text-muted-foreground">{statusMessage}</p>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                gameState === "flipping"
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-amber-950 shadow-lg shadow-amber-500/30 hover:from-amber-200 hover:via-amber-300 hover:to-amber-400"
              )}
              disabled={gameState === "flipping"}
              onClick={() => startFlip("heads")}
            >
              Call Heads
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                gameState === "flipping"
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-foreground text-background hover:bg-foreground/90"
              )}
              disabled={gameState === "flipping"}
              onClick={() => startFlip("tails")}
            >
              Call Tails
            </button>
            {gameState === "lost" && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground/10"
                onClick={resetRun}
              >
                <RefreshIcon size={16} /> Try again
              </button>
            )}
          </div>

          {gameState === "lost" && currentScore > 0 && (
            <form className="glass-card flex flex-col gap-3 border border-primary/30 bg-primary/5 p-4" onSubmit={handleSubmitScore}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">Submit your streak</span>
                {scoreSubmitted && <span className="text-xs uppercase text-primary">Saved!</span>}
              </div>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">Name (max {MAX_NAME_LENGTH} characters)</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={nameInput}
                  onChange={(event) => {
                    setNameInput(event.target.value.slice(0, MAX_NAME_LENGTH));
                    setSubmitError(null);
                  }}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="Initials or nickname"
                  disabled={isSubmitting || scoreSubmitted}
                />
              </label>
              {submitError && <p className="text-xs text-destructive">{submitError}</p>}
              <button
                type="submit"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                  scoreSubmitted
                    ? "cursor-default bg-muted text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
                disabled={isSubmitting || scoreSubmitted}
              >
                {isSubmitting ? "Saving…" : scoreSubmitted ? "Score submitted" : "Submit score"}
              </button>
            </form>
          )}
        </div>

        <aside className="glass-card flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Top streaks</h2>
            </div>
            <Link
              href="/coinflip/highscores"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => track("coinflip_leaderboard_viewed", {})}
            >
              View all
            </Link>
          </div>

          <LeaderboardTable entries={displayLeaderboard} />
        </aside>
      </section>
    </main>
  );
}

type CoinDisplayProps = {
  face: FlipSide;
  animate: boolean;
  seed: number;
};

function CoinDisplay({ face, animate, seed }: CoinDisplayProps) {
  return (
    <div
      key={seed}
      className={cn("coin relative h-40 w-40", animate ? "coin--flipping" : "")}
      data-face={face}
    >
      <div className="coin__face coin__face--front">Heads</div>
      <div className="coin__face coin__face--back">Tails</div>
    </div>
  );
}

type LeaderboardProps = {
  entries: LeaderboardRow[];
};

function LeaderboardTable({ entries }: LeaderboardProps) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No streaks yet. Be the first!</p>;
  }

  return (
    <ol className="flex flex-col gap-2 text-sm">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className={cn(
            "flex items-center justify-between rounded-xl border px-4 py-3",
            entry.placeholder
              ? "border-dashed border-border/60 bg-muted/40 text-muted-foreground"
              : "border-border bg-background/80"
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                entry.placeholder ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
              )}
            >
              #{index + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                entry.placeholder ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {entry.name}
            </span>
          </div>
          <span
            className={cn(
              "text-lg font-semibold",
              entry.placeholder ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {entry.score}
          </span>
        </li>
      ))}
    </ol>
  );
}
