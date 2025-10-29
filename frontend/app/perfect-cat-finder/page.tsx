"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CatRenderParams } from "@/lib/cat-v3/types";
import { renderCatV3 } from "@/lib/cat-v3/api";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { Loader2, Trophy, ClipboardCopy, ExternalLink, X } from "lucide-react";
import { encodeCatShare } from "@/legacy/core/catShare";

const PALETTE_MODES = ["off", "mood", "bold", "darker", "blackout"] as const;
const NEW_CAT_PROBABILITY = 0.4;

function randomInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function pickPalette(): string {
  return PALETTE_MODES[Math.floor(Math.random() * PALETTE_MODES.length)];
}

type MatchupCat = {
  id: Id<"perfect_cats">;
  rating: number;
  wins: number;
  losses: number;
  appearances: number;
  params: CatRenderParams;
};

type MatchupResponse = {
  cats: MatchupCat[];
  needsSeed: number;
  totalCats: number;
};

type LeaderboardEntry = MatchupCat;

function useClientToken(key: string): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = `pcf:${key}`;
    let existing = window.localStorage.getItem(storageKey);
    if (!existing) {
      if (window.crypto?.randomUUID) {
        existing = window.crypto.randomUUID();
      } else {
        existing = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
      }
      window.localStorage.setItem(storageKey, existing);
    }
    setToken(existing);
  }, [key]);

  return token;
}

type PreviewState = {
  url: string | null;
  loading: boolean;
};

function usePreviewCache() {
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});

  const ensurePreview = useCallback(async (cat: MatchupCat) => {
    const key = cat.id as unknown as string;
    setPreviews((prev) => {
      const current = prev[key];
      if (current?.url && !current.loading) {
        return prev;
      }
      return {
        ...prev,
        [key]: { url: current?.url ?? null, loading: true },
      };
    });
    try {
      const result = await renderCatV3(cat.params);
      setPreviews((prev) => ({
        ...prev,
        [key]: { url: result.imageDataUrl, loading: false },
      }));
    } catch (error) {
      console.error("Failed to render cat preview", error);
      setPreviews((prev) => ({
        ...prev,
        [key]: { url: null, loading: false },
      }));
    }
  }, []);

  const getPreview = useCallback(
    (cat: MatchupCat): PreviewState => {
      const key = cat.id as unknown as string;
      return previews[key] ?? { url: null, loading: true };
    },
    [previews]
  );

  return { ensurePreview, getPreview };
}

async function buildRandomCat(generator: Awaited<ReturnType<typeof useCatGenerator>>["generator"]): Promise<CatRenderParams> {
  if (!generator) {
    throw new Error("Generator unavailable");
  }
  const experimentalMode = pickPalette();
  const accessorySlots = randomInt(6);
  const scarSlots = randomInt(4);
  const tortieSlots = randomInt(4);
  const randomParams = (await generator.generateRandomParams({
    ignoreForbiddenSprites: true,
    experimentalColourMode: experimentalMode,
    includeBaseColours: true,
    slotOverrides: {
      accessories: accessorySlots,
      scars: scarSlots,
      tortie: tortieSlots,
    },
  } as Record<string, unknown>)) as Record<string, unknown>;

  const spriteNumberRaw = (randomParams.spriteNumber ?? randomParams.sprite) as number | undefined;
  const spriteNumber = Number.isFinite(spriteNumberRaw) ? Number(spriteNumberRaw) : 0;
  const { spriteNumber: _ignored, sprite: _legacy, ...rest } = randomParams;

  return {
    spriteNumber,
    params: rest,
  };
}

function formatRating(value: number): string {
  return value.toFixed(0);
}

function CatCard({
  cat,
  preview,
  disabled,
  onVote,
}: {
  cat: MatchupCat;
  preview: PreviewState;
  disabled: boolean;
  onVote: (cat: MatchupCat) => Promise<void>;
}) {
  return (
    <div className="glass-card flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-inner">
      <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Pick your favourite</div>
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-background/80">
        {preview.loading ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : preview.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt="Cat preview"
            className="h-full w-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground/80">Rating {formatRating(cat.rating)} · {cat.wins} wins · {cat.losses} losses</div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVote(cat)}
        className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Choose this cat
      </button>
    </div>
  );
}

export default function PerfectCatFinderPage() {
  const clientId = useClientToken("device");
  const requestMatchup = useMutation(api.perfectCats.requestMatchup);
  const registerCats = useMutation(api.perfectCats.registerCats);
  const submitVote = useMutation(api.perfectCats.submitVote);
  const leaderboard = useQuery(api.perfectCats.leaderboard, { limit: 10 });
  const { generator, ready } = useCatGenerator();
  const { ensurePreview, getPreview } = usePreviewCache();

  const [message, setMessage] = useState<string | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);
  const [matchup, setMatchup] = useState<MatchupCat[]>([]);
  const [poolSize, setPoolSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voteBusy, setVoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<MatchupCat | null>(null);

  const showMessage = useCallback((text: string) => {
    if (messageTimeoutRef.current) {
      window.clearTimeout(messageTimeoutRef.current);
    }
    setMessage(text);
    messageTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimeoutRef.current = null;
    }, 3000);
  }, []);

  const seedCats = useCallback(
    async (count: number) => {
      if (!ready || !generator || count <= 0) return;
      const payload: { params: CatRenderParams }[] = [];
      for (let i = 0; i < count; i += 1) {
        try {
          const catParams = await buildRandomCat(generator);
          payload.push({ params: catParams });
        } catch (err) {
          console.error("Failed to generate random cat", err);
        }
      }
      if (payload.length) {
        await registerCats({ cats: payload });
      }
    },
    [generator, ready, registerCats]
  );

  const loadMatchup = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      let response = (await requestMatchup({ clientId })) as unknown as MatchupResponse;
      let seeded = false;

      if (response.needsSeed > 0 && ready && generator) {
        const extra = Math.max(2, Math.ceil(response.needsSeed * 0.5));
        await seedCats(response.needsSeed + extra);
        seeded = true;
      } else if (ready && generator && Math.random() < NEW_CAT_PROBABILITY) {
        await seedCats(1 + Math.floor(Math.random() * 2));
        seeded = true;
      }

      if (seeded) {
        response = (await requestMatchup({ clientId })) as unknown as MatchupResponse;
      }

      if (response.cats.length >= 2) {
        const normalized = response.cats.slice(0, 2).map((cat) => ({
          ...cat,
          params: cat.params as CatRenderParams,
        }));
        setMatchup(normalized);
        setPoolSize(response.totalCats);
        normalized.forEach((cat) => void ensurePreview(cat));
      } else {
        setMatchup([]);
        setPoolSize(response.totalCats);
      }
    } catch (err) {
      console.error("Failed to load matchup", err);
      setError(err instanceof Error ? err.message : "Failed to load matchup");
    } finally {
      setLoading(false);
    }
  }, [clientId, ensurePreview, generator, ready, requestMatchup, seedCats]);

  useEffect(() => {
    if (!clientId) return;
    loadMatchup().catch((err) => {
      console.error(err);
    });
  }, [clientId, loadMatchup]);

  const handleVote = useCallback(
    async (winner: MatchupCat) => {
      if (!clientId || matchup.length < 2) return;
      const loser = matchup.find((cat) => cat.id !== winner.id);
      if (!loser) return;
      setVoteBusy(true);
      try {
        await submitVote({
          clientId,
          winnerId: winner.id,
          loserId: loser.id,
        });
      } catch (err) {
        console.error("Failed to submit vote", err);
        setError(err instanceof Error ? err.message : "Failed to submit vote");
      } finally {
        setVoteBusy(false);
      }
      await loadMatchup();
    },
    [clientId, loadMatchup, matchup, submitVote]
  );

  const handleCopySprite = useCallback(
    async (cat: MatchupCat) => {
      try {
        await ensurePreview(cat);
        const preview = getPreview(cat);
        if (!preview.url) {
          throw new Error("Preview unavailable");
        }
        const response = await fetch(preview.url);
        const blob = await response.blob();
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
          showMessage("Sprite copied to clipboard");
        } else {
          const link = document.createElement("a");
          link.href = preview.url;
          link.download = "perfect-cat.png";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showMessage("Sprite downloaded");
        }
      } catch (copyError) {
        console.error("Failed to copy sprite", copyError);
        setError("Failed to copy sprite. Please try again.");
      }
    },
    [ensurePreview, getPreview, showMessage]
  );

  const handleOpenInBuilder = useCallback((cat: MatchupCat) => {
    try {
      const coreParams = {
        ...(cat.params.params as Record<string, unknown>),
        spriteNumber: cat.params.spriteNumber,
      } as Record<string, unknown>;

      const accessories = Array.isArray(coreParams.accessories) ? (coreParams.accessories as string[]) : [];
      const scars = Array.isArray(coreParams.scars) ? (coreParams.scars as string[]) : [];
      const tortie = Array.isArray(coreParams.tortie) ? (coreParams.tortie as Record<string, unknown>[]) : [];

      const encoded = encodeCatShare({
        params: coreParams,
        accessorySlots: accessories,
        scarSlots: scars,
        tortieSlots: tortie,
        counts: {
          accessories: accessories.length,
          scars: scars.length,
          tortie: tortie.length,
        },
      });

      const url = `/visual-builder?cat=${encodeURIComponent(encoded)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (shareError) {
      console.error("Failed to open cat in builder", shareError);
      setError("Could not open the cat in the visual builder.");
    }
  }, [setError]);

  const leaderboardEntries: LeaderboardEntry[] = (leaderboard as LeaderboardEntry[] | undefined) ?? [];

  useEffect(() => {
    leaderboardEntries.forEach((entry) => void ensurePreview(entry));
  }, [leaderboardEntries, ensurePreview]);

  useEffect(() => () => {
    if (messageTimeoutRef.current) {
      window.clearTimeout(messageTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (selectedCat) {
      void ensurePreview(selectedCat);
    }
  }, [selectedCat, ensurePreview]);

  const isReady = useMemo(() => matchup.length === 2 && !loading, [matchup.length, loading]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-12">
      <section className="theme-hero theme-gatcha px-8 py-10 text-balance">
        <div className="section-eyebrow">Perfect Cat Finder</div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
          Vote between two cats. Help crown the favourite.
        </h1>
        {message && (
          <div className="mt-4 inline-flex items-center rounded-full border border-border/50 bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground">
            {message}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {isReady ? (
          matchup.map((cat) => (
            <CatCard
              key={String(cat.id)}
              cat={cat}
              preview={getPreview(cat)}
              disabled={voteBusy}
              onVote={handleVote}
            />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-background/60 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p>{error ?? "Preparing the next matchup..."}</p>
          </div>
        )}
      </section>

      <section className="glass-card space-y-6 rounded-3xl border border-border/60 bg-background/70 px-8 py-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Trophy className="size-5" />
            <h2 className="text-2xl font-semibold text-foreground">Community leaderboard</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Pool size {poolSize}
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border/40">
          <table className="min-w-full table-auto text-sm">
            <thead className="bg-background/80 text-xs uppercase tracking-wide text-muted-foreground/70">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Sprite</th>
                <th className="px-4 py-3 text-left">Rating</th>
                <th className="px-4 py-3 text-left">Record</th>
                <th className="px-4 py-3 text-left">Votes</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground/70">
                    No votes yet — be the first to crown a favourite.
                  </td>
                </tr>
              ) : (
                leaderboardEntries.map((entry, index) => {
                  const preview = getPreview(entry);
                  return (
                    <tr key={String(entry.id)} className="border-t border-border/30">
                      <td className="px-4 py-3 text-muted-foreground/70">{index + 1}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCat(entry);
                            void ensurePreview(entry);
                          }}
                          className="group flex items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 transition hover:border-primary/50"
                        >
                          {preview.loading ? (
                            <Loader2 className="size-4 animate-spin text-primary" />
                          ) : preview.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview.url}
                              alt="Cat preview"
                              className="h-16 w-16 object-contain transition group-hover:scale-105"
                              style={{ imageRendering: "pixelated" }}
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No preview</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{formatRating(entry.rating)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.wins} – {entry.losses}</td>
                      <td className="px-4 py-3 text-muted-foreground/70">{entry.appearances}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selectedCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="absolute inset-0" onClick={() => setSelectedCat(null)} />
          <div className="relative z-10 w-full max-w-xl rounded-3xl border border-border/60 bg-background/95 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedCat(null)}
              className="absolute right-3 top-3 rounded-full border border-border/40 bg-background/80 p-1 text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <div className="flex flex-col gap-4">
              <div className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Top contender</div>
              <div className="flex items-center justify-center rounded-3xl border border-border/60 bg-background/80 p-4">
                {(() => {
                  const preview = getPreview(selectedCat);
                  if (preview.loading) {
                    return <Loader2 className="size-8 animate-spin text-primary" />;
                  }
                  if (!preview.url) {
                    return <span className="text-sm text-muted-foreground">Preview unavailable</span>;
                  }
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt="Selected cat"
                      className="h-[320px] w-[320px] object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Rating {formatRating(selectedCat.rating)}</span>
                <span>{selectedCat.wins} – {selectedCat.losses}</span>
                <span>{selectedCat.appearances} votes</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleCopySprite(selectedCat)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  <ClipboardCopy className="size-4" /> Copy sprite
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenInBuilder(selectedCat)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  <ExternalLink className="size-4" /> Open in visual builder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
