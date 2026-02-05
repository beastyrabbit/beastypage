"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Vote } from "lucide-react";
import TriangleAlertIcon from "@/components/ui/triangle-alert-icon";
import UsersIcon from "@/components/ui/users-icon";
import { useMutation, useQuery } from "convex/react";
import { track } from "@/lib/analytics";

import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import { cloneParams, createStreamSteps, getDefaultStreamParams } from "@/lib/streamer/steps";
import type { StreamerParams, StreamStep } from "@/lib/streamer/steps";
import { cn } from "@/lib/utils";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import OptionPreview from "@/components/streamer/OptionPreview";
import { ensureSpriteDataLoaded } from "@/lib/streamer/steps";

type SessionRecord = typeof api.streamSessions.get._returnType;
type ParticipantRecord = (typeof api.streamParticipants.list._returnType)[number];

type StreamParams = StreamerParams;
type StepOption = ReturnType<StreamStep["getOptions"]>[number];

const VIEWER_SESSION_PREFIX = "stream-viewer-session";

const COLOUR_MODE_LABELS: Record<string, string> = {
  classic: "Classic",
  mood: "Mood",
  bold: "Bold",
  darker: "Darker",
  blackout: "Blackout",
  mononoke: "Princess Mononoke",
  howl: "Howl's Moving Castle",
  demonslayer: "Demon Slayer",
  titanic: "Titanic",
  deathnote: "Death Note",
  slime: "Reincarnated as a Slime",
  ghostintheshell: "Ghost in the Shell",
  mushishi: "Mushishi",
  chisweethome: "Chi's Sweet Home",
  fma: "Fullmetal Alchemist",
  all: "All",
};

function generateViewerSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function buildViewerSessionId(name: string) {
  const base = sanitizeName(name).toLowerCase();
  if (!base) return generateViewerSessionId();
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  const token = (hash >>> 0).toString(16).padStart(8, "0");
  return `name-${token}`;
}

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === "object" && error !== null) {
    if ("data" in error) {
      const data = (error as { data?: Record<string, unknown> }).data;
      if (data && typeof data === "object" && "error" in data) {
        const value = (data as Record<string, unknown>).error;
        if (typeof value === "string") {
          return value;
        }
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
  }
  return null;
}

export function ViewerClient() {
  const searchParams = useSearchParams();
  const viewerKey = searchParams?.get("viewer")?.trim() ?? null;
  const [viewerSession, setViewerSession] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [mapperReady, setMapperReady] = useState(false);
  const { generator, ready: generatorReady } = useCatGenerator();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.localStorage ?? window.sessionStorage;
    const baseKey = `${VIEWER_SESSION_PREFIX}:fingerprint`;
    let existingFingerprint = storage.getItem(baseKey);
    if (!existingFingerprint) {
      existingFingerprint = generateViewerSessionId();
      storage.setItem(baseKey, existingFingerprint);
    }
    const timer = window.setTimeout(() => setFingerprint(existingFingerprint), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.sessionStorage ?? window.localStorage;
    const key = viewerKey ? `${VIEWER_SESSION_PREFIX}:${viewerKey}` : VIEWER_SESSION_PREFIX;
    const existing = storage.getItem(key);
    if (existing) {
      const timer = window.setTimeout(() => setViewerSession(existing), 0);
      return () => window.clearTimeout(timer);
    }
  }, [viewerKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSpriteDataLoaded();
        if (!cancelled) {
          setMapperReady(true);
        }
      } catch (error) {
        console.error("Failed to load sprite data", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionLookupArgs = useMemo(() => {
    if (!viewerKey) return "skip" as const;
    return { viewerKey, limit: 1 } as const;
  }, [viewerKey]);

  const sessionMatches = useQuery(api.streamSessions.list, sessionLookupArgs) ?? [];
  const sessionId = sessionMatches[0]?.id ?? null;

  const sessionArgs = useMemo(() => {
    if (!sessionId) return "skip" as const;
    return { id: toId("stream_sessions", sessionId) } as const;
  }, [sessionId]);

  const session = useQuery(api.streamSessions.get, sessionArgs) as SessionRecord;

  const votesArgs = useMemo(() => {
    if (!sessionId) return "skip" as const;
    return {
      session: toId("stream_sessions", sessionId),
      stepId: session?.current_step ?? undefined,
      limit: 500,
    } as const;
  }, [sessionId, session?.current_step]);

  const rawVotes = useQuery(api.streamVotes.list, votesArgs);
  const votes = useMemo(() => rawVotes ?? [], [rawVotes]);

  const participantArgs = useMemo(() => {
    if (!sessionId || !viewerSession) return "skip" as const;
    return {
      session: toId("stream_sessions", sessionId),
      viewerSession,
      limit: 1,
    } as const;
  }, [sessionId, viewerSession]);

  const rawParticipantList = useQuery(api.streamParticipants.list, participantArgs);
  const participantList = useMemo(() => rawParticipantList ?? [], [rawParticipantList]);
  const participant = participantList[0] as ParticipantRecord | undefined;

  useEffect(() => {
    if (!participant?.display_name) return;
    const timer = window.setTimeout(() => setDisplayName(participant.display_name), 0);
    return () => window.clearTimeout(timer);
  }, [participant?.display_name]);

  const registerParticipant = useMutation(api.streamParticipants.create);
  const createVote = useMutation(api.streamVotes.create);

  const currentStepId = session?.current_step ?? null;
  const params = useMemo(
    () =>
      cloneParams<StreamParams>(
        (session?.params as StreamParams | undefined) ?? getDefaultStreamParams()
      ),
    [session?.params]
  );
  const steps = useMemo<StreamStep[]>(
    () => (mapperReady ? createStreamSteps({ params }) : []),
    [params, mapperReady]
  );
  const currentStep = useMemo(() => {
    if (!steps.length) return null;
    if (!currentStepId) return steps[0];
    return steps.find((step) => step.id === currentStepId) ?? steps[0];
  }, [steps, currentStepId]);

  const stepState = useMemo(
    () => ({ params, history: Array.isArray(session?.step_history) ? session.step_history : [] }),
    [params, session]
  );

  const options: StepOption[] = useMemo(() => {
    if (!currentStep || !mapperReady) return [];
    return currentStep.getOptions(stepState) as StepOption[];
  }, [currentStep, stepState, mapperReady]);

  const voteCounts = useMemo(() => {
    const map = new Map<string, number>();
    votes.forEach((vote) => {
      map.set(vote.option_key, (map.get(vote.option_key) ?? 0) + 1);
    });
    return map;
  }, [votes]);

  const disabledOptions = useMemo(() => {
    if (!params || !currentStep) return new Set<string>();
    const map = params._disabledOptions;
    const list = map?.[currentStep.id] ?? [];
    return new Set(list);
  }, [params, currentStep]);

  const tieFilter = useMemo(() => {
    const filter = params?._tieFilter;
    return Array.isArray(filter) && filter.length ? new Set(filter) : null;
  }, [params]);

  const { displayOptions, activeTieFilter } = useMemo(() => {
    if (tieFilter && tieFilter.size) {
      const filtered = options.filter((option) => tieFilter.has(option.key));
      if (filtered.length) {
        return { displayOptions: filtered, activeTieFilter: tieFilter };
      }
    }
    return { displayOptions: options, activeTieFilter: null as Set<string> | null };
  }, [options, tieFilter]);

  const participantVote = useMemo(() => {
    if (!participant) return null;
    return votes.find((vote) => vote.option_meta?.participantId === participant.id) ?? null;
  }, [votes, participant]);

  const totalVotes = useMemo(() => votes.length, [votes]);

  const votingStatus = useMemo(() => {
    if (!session) return { code: "loading", reason: "Loading session…" } as const;
    const status = (session.status ?? "draft").toLowerCase();
    if (status === "completed") {
      return { code: "finished", reason: "Voting has finished." } as const;
    }
    if (status !== "live") {
      return { code: "waiting", reason: "Waiting for the streamer to go live." } as const;
    }
    if (session.params?._votesOpen !== true) {
      return { code: "closed", reason: "Voting is closed." } as const;
    }
    if (!participant) {
      return { code: "needs_name", reason: "Enter your name to join the vote." } as const;
    }
    if ((participant.status ?? "active").toLowerCase() !== "active") {
      return { code: "blocked", reason: "You have been removed from this session." } as const;
    }
    return { code: "ready", reason: "" } as const;
  }, [session, participant]);

  const handleNameSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sessionId) return;
      const cleaned = sanitizeName(displayName);
      if (!cleaned) {
        setNameError("Please enter a name");
        return;
      }
      const sessionToken = buildViewerSessionId(cleaned);
      if (typeof window !== "undefined") {
        const storage = window.sessionStorage ?? window.localStorage;
        const key = viewerKey ? `${VIEWER_SESSION_PREFIX}:${viewerKey}` : VIEWER_SESSION_PREFIX;
        storage.setItem(key, sessionToken);
      }
      setViewerSession(sessionToken);
      try {
        setNameError(null);
        await registerParticipant({
          sessionId: toId("stream_sessions", sessionId),
          viewerSession: sessionToken,
          displayName: cleaned,
          status: "active",
          fingerprint: fingerprint ?? undefined,
        });
        setStatusMessage("Checked in! You can vote when polls are open.");
        track("stream_viewer_joined", {});
      } catch (error) {
        const message = extractErrorMessage(error) ?? "Unable to join right now.";
        setNameError(message);
      }
    },
    [sessionId, viewerKey, displayName, registerParticipant, fingerprint]
  );

  const handleVote = useCallback(
    async (option: StepOption) => {
      if (!participant || !sessionId || !currentStep || votingStatus.code !== "ready") return;
      try {
        await createVote({
          sessionId: toId("stream_sessions", sessionId),
          stepId: currentStep.id,
          optionKey: option.key,
          optionMeta: {
            participantId: participant.id,
            participantName: participant.display_name,
          },
          votedBy: toId("stream_participants", participant.id),
        });
        setStatusMessage("Vote recorded!");
        track("stream_vote_cast", { is_streamer: false });
      } catch (error) {
        console.error("Vote failed", error);
        const message = extractErrorMessage(error) ?? "Unable to record your vote. Try again.";
        setStatusMessage(message);
      }
    },
    [participant, sessionId, currentStep, votingStatus.code, createVote]
  );

  const [optionSearch, setOptionSearch] = useState("");
  const filteredOptions = useMemo(() => {
    const term = optionSearch.trim().toLowerCase();
    if (!term) return displayOptions;
    return displayOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [displayOptions, optionSearch]);

  useEffect(() => {
    const id = window.setTimeout(() => setOptionSearch(""), 0);
    return () => window.clearTimeout(id);
  }, [currentStep?.id, session?.params?._votesOpen, session?.status]);

  const sessionParams = session?.params as StreamParams | undefined;
  const finalShareUrl = sessionParams?._finalShareUrl ?? null;
  const finalCatName = sessionParams?._finalName ?? null;
  const finalCreatorName = sessionParams?._finalCreator ?? null;
  const finalDisplayLabel = finalCatName ? `“${finalCatName}”` : "The final cat";
  const finalDisplayCreator = finalCreatorName ? ` by ${finalCreatorName}` : "";
  const signupsOpen = sessionParams?._signupsOpen !== false;
  const votesOpen = sessionParams?._votesOpen === true;
  const currentPaletteMode = typeof sessionParams?._paletteMode === "string" ? sessionParams._paletteMode : "classic";

  if (!viewerKey) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background/80 p-6 text-center text-sm text-muted-foreground">
        Missing viewer key. Ask the streamer for a fresh link.
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background/80 p-6 text-center text-sm text-muted-foreground">
        Waiting for the streamer to go live. Refresh this page when the session starts.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-eyebrow">Viewer panel</p>
            <h1 className="text-2xl font-semibold text-foreground">Cast your vote</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold",
                signupsOpen
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-100"
              )}
            >
              <UsersIcon size={12} /> {signupsOpen ? "Sign ups open" : "Sign ups closed"}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold",
                votesOpen
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-slate-500/50 bg-slate-500/10 text-slate-200"
              )}
            >
              <Vote className="size-3" /> {votesOpen ? "Voting open" : "Voting closed"}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
            {statusMessage}
          </div>
        )}

        {session?.status === "completed" && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
            Voting finished!
            {finalShareUrl ? (
              <span className="ml-2 inline-flex flex-wrap items-center gap-2">
                <span className="font-medium">{finalDisplayLabel}{finalDisplayCreator}</span>
                <Link href={finalShareUrl} target="_blank" className="underline decoration-primary/60 underline-offset-4 transition hover:decoration-primary">View</Link>
                <span className="text-primary/70">or</span>
                <Link href="/history" className="underline decoration-primary/60 underline-offset-4 transition hover:decoration-primary">history</Link>
              </span>
            ) : (
              <span className="ml-2 inline-flex">
                <Link href="/history" className="underline decoration-primary/60 underline-offset-4 transition hover:decoration-primary">Browse history</Link>
              </span>
            )}
          </div>
        )}

        {participant && participant.status?.toLowerCase() === "active" ? (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            Checked in as <span className="font-semibold text-emerald-50">{participant.display_name || "Viewer"}</span>.
          </div>
        ) : (
          <form onSubmit={handleNameSubmit} className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="flex-1 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm"
                placeholder="Enter your name"
                disabled={!signupsOpen}
              />
              <button
                type="submit"
                disabled={!signupsOpen}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UsersIcon size={16} /> Check in
              </button>
            </div>
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            {!signupsOpen && (
              <p className="text-xs text-muted-foreground">Sign ups are closed for this session.</p>
            )}
          </form>
        )}

        {votingStatus.code !== "ready" && votingStatus.reason && (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            <TriangleAlertIcon size={16} /> {votingStatus.reason}
          </div>
        )}
      </section>

      <section className="glass-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{currentStep?.title}</h2>
            <p className="text-sm text-muted-foreground">{currentStep?.description}</p>
          </div>
          <div className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes === 1 ? "" : "s"}</div>
        </div>

        {currentStep?.id === "colour" && (
          <div className="text-xs text-muted-foreground">
            Palette:&nbsp;
            {COLOUR_MODE_LABELS[currentPaletteMode] ?? currentPaletteMode}
          </div>
        )}

        {!participant && (
          <div className="rounded-xl border border-border/50 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
            Check in to join this vote.
          </div>
        )}

        {participant && participant.status?.toLowerCase() !== "active" && (
          <div className="rounded-xl border border-border/50 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
            Waiting for the streamer to approve your entry.
          </div>
        )}

        <div className="flex items-center gap-2">
          <label
            htmlFor="viewer-option-search"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Search
          </label>
          <input
            id="viewer-option-search"
            type="search"
            value={optionSearch}
            onChange={(event) => setOptionSearch(event.target.value)}
            className="flex-1 rounded-lg border border-border/50 bg-background/70 px-3 py-1.5 text-sm focus:border-primary/60 focus:outline-none"
            placeholder="Filter options"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOptions.length === 0 && (
            <p className="col-span-full rounded-3xl border border-border/50 bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
              No options match your search.
            </p>
          )}
          {filteredOptions.map((option) => {
            const disabledByHost = disabledOptions.has(option.key);
            const allowedByTie = !activeTieFilter || activeTieFilter.has(option.key);
            const disabled = disabledByHost || !allowedByTie;
            const isSelected = participantVote?.option_key === option.key;
            const votesForOption = voteCounts.get(option.key) ?? 0;
            const viewerActive = participant && participant.status?.toLowerCase() === "active";
            const readyToVote = viewerActive && votingStatus.code === "ready";
            const existingVoteValid =
              participantVote && displayOptions.some((opt) => opt.key === participantVote.option_key);
            const showYourVote = Boolean(existingVoteValid && isSelected);
            return (
              <button
                key={option.key}
                type="button"
                disabled={disabled || !readyToVote || Boolean(existingVoteValid)}
                onClick={() => handleVote(option)}
                className={cn(
                  "group relative flex h-full flex-col items-center justify-center gap-4 rounded-3xl border px-4 py-6 text-center transition sm:px-6",
                  disabled || !readyToVote
                    ? "border-border/40 bg-background/40 text-muted-foreground"
                    : "border-border/60 bg-background/70 hover:border-primary/40",
                  isSelected && "border-primary/60 bg-primary/10"
                )}
              >
                <div className="relative rounded-xl">
                  <OptionPreview
                    generator={generator}
                    ready={generatorReady}
                    baseParams={params}
                    step={currentStep}
                    option={option}
                    allOptions={displayOptions}
                    size={250}
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 rounded-[inherit] bg-black/65 px-4 py-4 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <div className="text-sm font-semibold uppercase tracking-wide">{option.label}</div>
                    <div className="text-xs">
                      {votesForOption} vote{votesForOption === 1 ? "" : "s"}
                      {showYourVote ? " · Your vote" : ""}
                    </div>
                  </div>
                  {disabledByHost && (
                    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Disabled by host
                    </div>
                  )}
                </div>
                <span className="sr-only">
                  {option.label} — {votesForOption} vote{votesForOption === 1 ? "" : "s"}
                  {showYourVote ? " (your vote)" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h3 className="text-lg font-semibold text-foreground">Timeline</h3>
        <div className="grid gap-2 text-sm">
          {Array.isArray(session?.step_history) && session.step_history.length > 0 ? (
            session.step_history.map((entry, index) => (
              <div
                key={`${entry.step_id ?? entry.option_key ?? index}-${index}`}
                className="rounded-xl border border-border/50 bg-background/70 px-3 py-2"
              >
                <div className="text-xs text-muted-foreground">Step {index + 1}</div>
                <div className="font-semibold text-foreground">{entry.title}</div>
                <div className="text-xs text-muted-foreground">{entry.label}</div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">The streamer hasn&apos;t locked any steps yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default ViewerClient;
