"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Users,
  Vote,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { toId } from "@/convex/utils";
import {
  cloneParams,
  createStreamSteps,
  ensureSpriteDataLoaded,
  getDefaultStreamParams,
} from "@/lib/streamer/steps";
import type { StreamerParams, StreamStep } from "@/lib/streamer/steps";
import { buildStreamerSharePayload } from "@/lib/streamer/share";
import { cn } from "@/lib/utils";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import OptionPreview from "@/components/streamer/OptionPreview";

type SessionListItem = (typeof api.streamSessions.list._returnType)[number];
type ParticipantRecord = (typeof api.streamParticipants.list._returnType)[number];

type LockedEntry = {
  step_id?: string;
  title?: string;
  option_key?: string;
  label?: string;
  votes?: number;
};

type StreamParams = StreamerParams;

type StreamerState = {
  params: StreamParams;
  history: LockedEntry[];
  [key: string]: unknown;
};

type StepOption = ReturnType<StreamStep["getOptions"]>[number];

type StepDefinition = StreamStep;

type VoteRow = {
  option: StepOption;
  count: number;
};

const COLOUR_PALETTE_MODES: Array<{ id: string; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "mood", label: "Mood" },
  { id: "bold", label: "Bold" },
  { id: "darker", label: "Darker" },
  { id: "blackout", label: "Blackout" },
  { id: "all", label: "All" },
];

const PREVIEW_SIZE = 240;

const COIN_FACE_SIZE = PREVIEW_SIZE - 32;

function generateViewerKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildStepState(params: StreamParams, history: LockedEntry[]): StreamerState {
  return {
    params: cloneParams<StreamParams>(params),
    history: Array.isArray(history) ? [...history] : [],
  };
}

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return "just now";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes <= 0) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HostClient() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localState, setLocalState] = useState<StreamerState>(() => ({
    params: getDefaultStreamParams(),
    history: [],
  }));
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mapperReady, setMapperReady] = useState(false);
  const [coinModalOpen, setCoinModalOpen] = useState(false);
  const [coinFlipping, setCoinFlipping] = useState(false);
  const [coinResult, setCoinResult] = useState<VoteRow | null>(null);
  const [coinWinner, setCoinWinner] = useState<VoteRow | null>(null);
  const [coinFlipId, setCoinFlipId] = useState(0);
  const [voteSent, setVoteSent] = useState(false);

  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [finalizeName, setFinalizeName] = useState("");
  const [finalizeCreator, setFinalizeCreator] = useState("");
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalShareInfo, setFinalShareInfo] = useState<{ slug: string; url: string } | null>(null);

  const finalParamsRef = useRef<StreamParams | null>(null);
  const finalHistoryRef = useRef<LockedEntry[]>([]);

  const { generator, ready: generatorReady } = useCatGenerator();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sessionArgs = useMemo(() => {
    if (!activeSessionId) return "skip" as const;
    return { id: toId("stream_sessions", activeSessionId) } as const;
  }, [activeSessionId]);

  const session = useQuery(api.streamSessions.get, sessionArgs);

  useEffect(() => {
    if (!coinModalOpen) {
      setCoinWinner(null);
      setCoinResult(null);
      setCoinFlipping(false);
      setCoinFlipId(0);
      setVoteSent(false);
    }
  }, [coinModalOpen]);

  const sessionList = useQuery(api.streamSessions.list, {
    exclude: "completed",
    limit: 20,
  });
  const sessionListResolved = sessionList ?? [];

  const currentStepId = session?.current_step ?? null;

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

  const votesArgs = useMemo(() => {
    if (!activeSessionId) return "skip" as const;
    return {
      session: toId("stream_sessions", activeSessionId),
      stepId: currentStepId ?? undefined,
      limit: 500,
    } as const;
  }, [activeSessionId, currentStepId]);

  const rawVotes = useQuery(api.streamVotes.list, votesArgs);
  const votes = useMemo(() => rawVotes ?? [], [rawVotes]);

  const participantsArgs = useMemo(() => {
    if (!activeSessionId) return "skip" as const;
    return {
      session: toId("stream_sessions", activeSessionId),
      limit: 200,
    } as const;
  }, [activeSessionId]);

  const rawParticipants = useQuery(api.streamParticipants.list, participantsArgs);
  const participants = useMemo(() => rawParticipants ?? [], [rawParticipants]);

  const createSession = useMutation(api.streamSessions.create);
  const updateSession = useMutation(api.streamSessions.update);
  const completeSession = useMutation(api.streamSessions.update);
  const createVote = useMutation(api.streamVotes.create);
  const updateParticipant = useMutation(api.streamParticipants.update);
  const createMapperRecord = useMutation(api.mapper.create);

  useEffect(() => {
    (async () => {
      try {
        await ensureSpriteDataLoaded();
      } catch (error) {
        console.warn("Unable to preload sprite data", error);
      }
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    const params = cloneParams<StreamParams>(
      (session.params as StreamParams | undefined) ?? getDefaultStreamParams()
    );
    if ("allowRepeatIps" in params) {
      delete (params as Record<string, unknown>).allowRepeatIps;
    }
    const history = Array.isArray(session.step_history) ? [...session.step_history] : [];
    setLocalState({ params, history });
  }, [session]);

  const updateSessionQueryParam = useCallback(
    (sessionId: string | null) => {
      if (!pathname) return;
      const current = searchParams?.get("session") ?? null;
      if (current === sessionId) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (sessionId) {
        params.set("session", sessionId);
      } else {
        params.delete("session");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const preselected = searchParams?.get("session");
    if (preselected && !activeSessionId) {
      setActiveSessionId(preselected);
    }
  }, [searchParams, activeSessionId]);

  useEffect(() => {
    updateSessionQueryParam(activeSessionId ?? null);
  }, [activeSessionId, updateSessionQueryParam]);

  const steps = useMemo<StepDefinition[]>(() => {
    if (!mapperReady) return [];
    return createStreamSteps({ params: cloneParams<StreamParams>(localState.params) });
  }, [localState.params, mapperReady]);

  const currentStepIndex = useMemo(() => {
    if (!mapperReady || steps.length === 0) return 0;
    if (currentStepId) {
      const idx = steps.findIndex((step) => step.id === currentStepId);
      if (idx >= 0) return idx;
    }
    return Math.max(0, Math.min(session?.step_index ?? 0, steps.length - 1));
  }, [steps, currentStepId, session?.step_index, mapperReady]);

  const currentStep = steps.length ? steps[Math.min(currentStepIndex, steps.length - 1)] ?? null : null;

  const voteCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const vote of votes) {
      const key = vote.option_key;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [votes]);

  const stateForOptions = useMemo(() => buildStepState(localState.params, localState.history), [
    localState.params,
    localState.history,
  ]);

  const options = useMemo(() => {
    if (!currentStep) return [] as StepOption[];
    return currentStep.getOptions(stateForOptions) as StepOption[];
  }, [currentStep, stateForOptions]);

  const tieFilterSet = useMemo(() => {
    const params = session?.params as StreamParams | undefined;
    const raw = params?._tieFilter;
    if (!Array.isArray(raw) || !currentStep) return null;
    const valid = raw.filter((key) => options.some((option) => option.key === key));
    return valid.length ? new Set(valid) : null;
  }, [session?.params, currentStep, options]);

  const displayOptions = useMemo(() => {
    if (tieFilterSet && tieFilterSet.size) {
      const filtered = options.filter((option) => tieFilterSet.has(option.key));
      return filtered.length ? filtered : options;
    }
    return options;
  }, [options, tieFilterSet]);

  const voteRows: VoteRow[] = useMemo(() => {
    return displayOptions.map((option) => ({
      option,
      count: voteCounts.get(option.key) ?? 0,
    }));
  }, [displayOptions, voteCounts]);

  const [optionSearch, setOptionSearch] = useState("");
  const filteredVoteRows = useMemo(() => {
    const term = optionSearch.trim().toLowerCase();
    if (!term) return voteRows;
    return voteRows.filter((row) => row.option.label.toLowerCase().includes(term));
  }, [voteRows, optionSearch]);

  useEffect(() => {
    setOptionSearch("");
  }, [currentStep?.id, session?.params?._votesOpen, session?.status]);

  const highestVoteCount = useMemo(() => voteRows.reduce((max, row) => Math.max(max, row.count), 0), [voteRows]);

  const topOptions = useMemo(() => {
    if (highestVoteCount <= 0) return [] as VoteRow[];
    return voteRows.filter((row) => row.count === highestVoteCount);
  }, [voteRows, highestVoteCount]);

  const leaderKey = topOptions.length === 1 ? topOptions[0].option.key : null;
  const tieOptions = useMemo(() => (topOptions.length > 1 ? topOptions : []), [topOptions]);
  const tieOptionKeys = useMemo(() => tieOptions.map((row) => row.option.key), [tieOptions]);
  const tiePair = useMemo(() => (tieOptions.length === 2 ? tieOptions : []), [tieOptions]);

  useEffect(() => {
    if (!coinModalOpen) {
      setCoinWinner(null);
      setCoinResult(null);
      setCoinFlipping(false);
      setCoinFlipId(0);
      setVoteSent(false);
    } else if (tiePair.length !== 2) {
      setCoinModalOpen(false);
    }
  }, [coinModalOpen, tiePair.length]);

  const effectiveTieKeys = useMemo(() => {
    if (tieOptionKeys.length) return tieOptionKeys;
    if (tieFilterSet && tieFilterSet.size > 0) return Array.from(tieFilterSet);
    return [] as string[];
  }, [tieOptionKeys, tieFilterSet]);

  const disabledOptionsSet = useMemo(() => {
    if (!session?.params || !currentStep) return new Set<string>();
    const params = session.params as StreamParams;
    const map = params._disabledOptions;
    return new Set(map?.[currentStep.id] ?? []);
  }, [session?.params, currentStep]);

  const totalVotes = useMemo(() => voteRows.reduce((sum, row) => sum + row.count, 0), [voteRows]);
  const activeParticipantCount = useMemo(
    () => participants.filter((p) => (p.status ?? "active").toLowerCase() === "active").length,
    [participants]
  );

  const leaderOption = useMemo(() => {
    if (!leaderKey) return null;
    return displayOptions.find((option) => option.key === leaderKey) ?? null;
  }, [leaderKey, displayOptions]);

  const hasUnresolvedTie = useMemo(() => tieOptions.length > 1, [tieOptions]);

  const frontOption = tiePair[0]?.option ?? null;
  const backOption = tiePair[1]?.option ?? null;

  const coinOrientation = useMemo(() => {
    const frontKey = frontOption?.key;
    if (!frontKey) return "show-front";
    const targetKey = coinFlipping && coinWinner
      ? coinWinner.option.key
      : coinResult
        ? coinResult.option.key
        : frontKey;
    return targetKey === frontKey ? "show-front" : "show-back";
  }, [frontOption?.key, coinFlipping, coinWinner, coinResult]);

  const coinMessage = useMemo(() => {
    if (coinFlipping) return "Flipping coin...";
    if (coinResult) {
      const label = coinResult.option.label;
      return voteSent ? `${label} wins! Vote recorded.` : `${label} wins!`;
    }
    if (voteSent) return "Vote recorded.";
    return "Press flip to resolve the tie.";
  }, [coinFlipping, coinResult, voteSent]);

  useEffect(() => {
    if (!generator || !generatorReady) return;
    const params = cloneParams(localState.params);
    let cancelled = false;
    (async () => {
      try {
        const result = await generator.generateCat(params);
        if (!cancelled) {
          setPreviewUrl(result.imageDataUrl ?? null);
        }
      } catch (error) {
        console.error("Failed to render preview", error);
        if (!cancelled) setPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generator, generatorReady, localState.params]);

  const handleStartSession = useCallback(async () => {
    try {
      setPending(true);
      const viewerKey = generateViewerKey();
      const initialParams = getDefaultStreamParams();
      const initialSteps = createStreamSteps({ params: cloneParams(initialParams) }) as StepDefinition[];
      const firstStepId = initialSteps[0]?.id ?? "colour";
      const record = await createSession({
        viewerKey,
        status: "live",
        currentStep: firstStepId,
        stepIndex: 0,
        stepHistory: [],
      params: initialParams,
      allowRepeatIps: false,
    });
      if (record?.id) {
        setActiveSessionId(record.id);
        updateSessionQueryParam(record.id);
        setStatusMessage("New session created. Share the viewer link to begin.");
      }
    setLocalState({ params: initialParams, history: [] });
  } catch (error) {
    console.error("Failed to start session", error);
    setStatusMessage("Unable to start a new session right now.");
  } finally {
    setPending(false);
  }
  }, [createSession, updateSessionQueryParam]);

  const handleResumeSession = useCallback((record: SessionListItem) => {
    setActiveSessionId(record.id);
    updateSessionQueryParam(record.id);
    setStatusMessage(null);
  }, [updateSessionQueryParam]);

  const updateSessionParams = useCallback(
    async (mutator: (draft: StreamParams) => void) => {
      if (!session || !activeSessionId) return;
      const params = cloneParams<StreamParams>(
        (session.params as StreamParams | undefined) ?? getDefaultStreamParams()
      );
      mutator(params);
      setLocalState((prev) => ({
        params,
        history: prev.history,
      }));
      try {
        await updateSession({
          id: toId("stream_sessions", activeSessionId),
          params,
        });
      } catch (error) {
        console.error("Failed to update session params", error);
        setStatusMessage("Update failed. Please try again.");
      }
    },
    [session, activeSessionId, updateSession]
  );

  const handleToggleSignups = useCallback(async () => {
    await updateSessionParams((draft) => {
      const open = draft._signupsOpen !== false;
      draft._signupsOpen = !open;
    });
  }, [updateSessionParams]);

  const handleToggleVotes = useCallback(async () => {
    await updateSessionParams((draft) => {
      const open = draft._votesOpen === true;
      draft._votesOpen = !open;
    });
  }, [updateSessionParams]);

  const handleToggleDuplicateIps = useCallback(async () => {
    if (!session || !activeSessionId) return;
    const currentAllow = session.allow_repeat_ips === true;
    const nextValue = !currentAllow;

    let paramsForUpdate: StreamParams | null = null;

    setLocalState((prev) => {
      const nextParams = cloneParams<StreamParams>(prev.params);
      if ("allowRepeatIps" in nextParams) {
        delete (nextParams as Record<string, unknown>).allowRepeatIps;
      }
      paramsForUpdate = nextParams;
      return {
        params: nextParams,
        history: prev.history,
      };
    });

    if (!paramsForUpdate) {
      const fallback = cloneParams<StreamParams>(localState.params);
      if ("allowRepeatIps" in fallback) {
        delete (fallback as Record<string, unknown>).allowRepeatIps;
      }
      paramsForUpdate = fallback;
    }

    try {
      await updateSession({
        id: toId("stream_sessions", activeSessionId),
        allowRepeatIps: nextValue,
        params: paramsForUpdate,
      });
      setStatusMessage(
        nextValue ? "Duplicate devices can now join this session." : "Duplicate devices are blocked again."
      );
    } catch (error) {
      console.error("Failed to toggle duplicate device setting", error);
      setStatusMessage("Unable to update the duplicate device setting. Please try again.");
    }
  }, [session, activeSessionId, localState.params, updateSession]);

  const handleCastStreamerVote = useCallback(
    async (option: StepOption) => {
      if (!session || !activeSessionId || !currentStep) return;
      try {
        await createVote({
          sessionId: toId("stream_sessions", activeSessionId),
          stepId: currentStep.id,
          optionKey: option.key,
          optionMeta: {
            label: option.label,
            step: currentStep.title,
            streamer: true,
          },
        });
        setStatusMessage("Streamer vote recorded.");
      } catch (error) {
        console.warn("Failed to record streamer vote", error);
        const message = error instanceof Error ? error.message : "Streamer vote failed.";
        setStatusMessage(message);
      }
    },
    [session, activeSessionId, currentStep, createVote]
  );

  const lockCurrentStep = useCallback(
    async (selected: StepOption, voteCount: number, advance: boolean) => {
      if (!session || !activeSessionId || !currentStep) return;

      const draftParams = cloneParams<StreamParams>(localState.params);
      const draftHistory = [...localState.history];
      const draftState: StreamerState = { params: draftParams, history: draftHistory };

      currentStep.apply(selected, draftState);
      draftState.params._votesOpen = false;
      if (draftState.params._tieFilter) {
        delete draftState.params._tieFilter;
      }
      if (draftState.params._tieIteration) {
        delete draftState.params._tieIteration;
      }

      const summary = currentStep.summarize(selected);
      const historyEntry: LockedEntry = {
        step_id: currentStep.id,
        title: currentStep.title,
        option_key: selected.key,
        label: summary,
        votes: voteCount,
      };

      const updatedHistory = [...draftState.history, historyEntry];

      if (localState.history.length === 0 && draftParams._signupsOpen !== false) {
        draftParams._signupsOpen = false;
      }

      const updatedSteps = createStreamSteps({ params: cloneParams<StreamParams>(draftParams) });
      const lockedIds = new Set(updatedHistory.map((entry) => entry.step_id));
      const allStepsComplete = lockedIds.size >= updatedSteps.length;
      const shouldFinalize = advance && allStepsComplete;

      const locatedIndex = updatedSteps.findIndex((step) => step.id === currentStep.id);
      let nextStepId = currentStep.id;
      let nextStepIndex = locatedIndex >= 0 ? locatedIndex : 0;

      if (advance && !shouldFinalize) {
        const nextUnlocked = updatedSteps.find((step) => !lockedIds.has(step.id));
        if (nextUnlocked) {
          nextStepId = nextUnlocked.id;
          const idx = updatedSteps.findIndex((step) => step.id === nextStepId);
          nextStepIndex = idx >= 0 ? idx : nextStepIndex;
        }
      }

      finalParamsRef.current = cloneParams<StreamParams>(draftParams);
      finalHistoryRef.current = updatedHistory.map((entry) => ({ ...entry }));

      try {
        setPending(true);
        setLocalState({ params: draftParams, history: updatedHistory });
        await updateSession({
          id: toId("stream_sessions", activeSessionId),
          params: draftParams,
          stepHistory: updatedHistory,
          stepIndex: nextStepIndex >= 0 ? nextStepIndex : 0,
          currentStep: nextStepId,
        });
        if (shouldFinalize && session?.status !== "completed") {
          setFinalShareInfo(null);
          setFinalizeName("");
          setFinalizeCreator("");
          setFinalizeError(null);
          setFinalizeModalOpen(true);
          setStatusMessage(`Locked in: ${summary}. Voting complete—add a name to finish.`);
        } else {
          setStatusMessage(`Locked in: ${summary}.`);
        }
      } catch (error) {
        console.error("Failed to lock step", error);
        setStatusMessage("Failed to lock the step. Try again.");
      } finally {
        setPending(false);
      }
    },
    [
      session,
      activeSessionId,
      currentStep,
      localState.params,
      localState.history,
      updateSession,
    ]
  );

  const handleNextStep = useCallback(async () => {
    if (!session || !activeSessionId || !currentStep) return;
    if (session.params?._votesOpen === true) {
      setStatusMessage("Close votes before advancing to the next step.");
      return;
    }

    if (hasUnresolvedTie) {
      setStatusMessage("Resolve the tie before advancing to the next step.");
      return;
    }

    const winner = voteRows.reduce<VoteRow | null>((top, row) => {
      if (!top) return row;
      if (row.count > top.count) return row;
      return top;
    }, null);

    const selected = winner?.option ?? options[0] ?? null;
    if (!selected) {
      setStatusMessage("No votes recorded yet. Give viewers more time.");
      return;
    }

    await lockCurrentStep(selected, winner?.count ?? 0, true);
  }, [
    session,
    activeSessionId,
    currentStep,
    voteRows,
    options,
    lockCurrentStep,
    hasUnresolvedTie,
  ]);


  const handleCoinFlip = useCallback(() => {
    if (tiePair.length !== 2) return;
    setCoinModalOpen(true);
    setCoinResult(null);
    setCoinWinner(null);
    setCoinFlipping(false);
    setVoteSent(false);
    setCoinFlipId(0);
  }, [tiePair.length]);

  const executeCoinFlip = useCallback(() => {
    if (coinFlipping || tiePair.length !== 2) return;
    const chosen = tiePair[Math.random() < 0.5 ? 0 : 1];
    setCoinWinner(chosen);
    setCoinResult(null);
    setCoinFlipping(true);
    setCoinFlipId((prev) => prev + 1);
  }, [coinFlipping, tiePair]);

  const handleCoinAnimationEnd = useCallback(async () => {
    if (!coinWinner) {
      setCoinFlipping(false);
      return;
    }

    const winnerRow = coinWinner;
    setCoinFlipping(false);
    setCoinResult(winnerRow);
    setCoinWinner(null);

    if (!voteSent && currentStep && activeSessionId) {
      try {
        await createVote({
          sessionId: toId("stream_sessions", activeSessionId),
          stepId: currentStep.id,
          optionKey: winnerRow.option.key,
          optionMeta: {
            label: winnerRow.option.label,
            step: currentStep.title,
            streamer: true,
            via: "coinFlip",
          },
        });
        setVoteSent(true);
        await updateSessionParams((draft) => {
          draft._votesOpen = false;
          if (draft._tieFilter) {
            delete draft._tieFilter;
          }
          if (draft._tieIteration) {
            const iteration = Number(draft._tieIteration) - 1;
            if (iteration > 0) {
              draft._tieIteration = iteration;
            } else {
              delete draft._tieIteration;
            }
          }
        });
        setCoinModalOpen(false);
        setStatusMessage(
          `Coin flip awarded an extra vote to ${winnerRow.option.label}. Voting closed automatically.`
        );
      } catch (error) {
        console.error("Failed to record coin flip vote", error);
        setStatusMessage("Unable to record the coin flip result. Try again or resolve manually.");
      }
    }
  }, [
    coinWinner,
    voteSent,
    currentStep,
    activeSessionId,
    createVote,
    updateSessionParams,
  ]);

  const handleTieRevote = useCallback(async () => {
    if (!currentStep || !activeSessionId) return;
    const keys = effectiveTieKeys;
    if (!keys.length) return;

    await updateSessionParams((draft) => {
      draft._tieFilter = keys;
      draft._votesOpen = true;
      draft._tieIteration = ((draft._tieIteration as number | undefined) ?? 0) + 1;
    });
    setStatusMessage("Tie-break vote reopened for the tied options.");
  }, [effectiveTieKeys, updateSessionParams, currentStep, activeSessionId]);

  const handleTieClear = useCallback(async () => {
    await updateSessionParams((draft) => {
      if (draft._tieFilter) {
        delete draft._tieFilter;
      }
      if (draft._tieIteration) {
        const value = Number(draft._tieIteration) - 1;
        if (value > 0) {
          draft._tieIteration = value;
        } else {
          delete draft._tieIteration;
        }
      }
    });
    setStatusMessage("Tie-break filter cleared.");
  }, [updateSessionParams]);

  const handleToggleOptionDisabled = useCallback(
    async (option: StepOption) => {
      if (!currentStep) return;
      await updateSessionParams((draft) => {
        const stepId = currentStep.id;
        const current = draft._disabledOptions ? { ...draft._disabledOptions } : {};
        const set = new Set<string>(current[stepId] ?? []);
        if (set.has(option.key)) {
          set.delete(option.key);
        } else {
          set.add(option.key);
        }
        if (set.size) {
          current[stepId] = Array.from(set);
        } else {
          delete current[stepId];
        }
        draft._disabledOptions = Object.keys(current).length ? current : undefined;
      });
    },
    [currentStep, updateSessionParams]
  );

  const handleCompleteSession = useCallback(async () => {
    if (!activeSessionId || !session) return;
    try {
      setPending(true);
      await completeSession({
        id: toId("stream_sessions", activeSessionId),
        status: "completed",
        params: session.params ?? {},
      });
      setStatusMessage("Session marked as completed.");
    } catch (error) {
      console.error("Failed to complete session", error);
      setStatusMessage("Unable to complete the session.");
    } finally {
      setPending(false);
    }
  }, [activeSessionId, session, completeSession]);

  const finalizeSession = useCallback(
    async ({ catName, creatorName }: { catName?: string; creatorName?: string }) => {
      if (!activeSessionId) {
        setFinalizeError('No active session to finalize.');
        return;
      }
      if (!finalParamsRef.current) {
        setFinalizeError('Final cat data is unavailable. Try refreshing.');
        return;
      }
      const name = (catName ?? finalizeName).trim();
      const creator = (creatorName ?? finalizeCreator).trim();
      setFinalizeSaving(true);
      setFinalizeError(null);
      try {
        const paramsCopy = cloneParams<StreamParams>(finalParamsRef.current);
        const historyCopy = finalHistoryRef.current.map((entry) => ({ ...entry }));
        finalHistoryRef.current = historyCopy;
        const payload = buildStreamerSharePayload(paramsCopy, historyCopy);
        const record = await createMapperRecord({
          catData: payload,
          catName: name || undefined,
          creatorName: creator || undefined,
        });
        const slug = (record as { slug?: string; shareToken?: string; id?: string }).slug
          ?? (record as { shareToken?: string; id?: string }).shareToken
          ?? (record as { id?: string }).id;
        if (!slug) {
          throw new Error('Share API did not return a slug.');
        }
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const url = origin ? `${origin}/view/${slug}` : `/view/${slug}`;

        const updatedParams = {
          ...cloneParams<StreamParams>(localState.params),
          _finalShareSlug: slug,
          _finalShareUrl: url,
          _finalName: name || null,
          _finalCreator: creator || null,
        } as StreamParams & Record<string, unknown>;

        await updateSession({
          id: toId('stream_sessions', activeSessionId),
          status: 'completed',
          params: updatedParams,
          stepHistory: historyCopy,
        });

        setLocalState({ params: updatedParams, history: historyCopy });
        finalParamsRef.current = cloneParams<StreamParams>(updatedParams);
        setFinalShareInfo({ slug, url });
        setFinalizeModalOpen(false);
        setStatusMessage('Session completed and saved to history.');
      } catch (error) {
        console.error('Failed to finalize session', error);
        setFinalizeError(error instanceof Error ? error.message : 'Unable to save the final cat.');
      } finally {
        setFinalizeSaving(false);
      }
    },
    [
      activeSessionId,
      createMapperRecord,
      finalizeCreator,
      finalizeName,
      localState.params,
      setLocalState,
      updateSession,
    ]
  );

  const handleFinalizeSubmit = useCallback(() => {
    void finalizeSession({ catName: finalizeName, creatorName: finalizeCreator });
  }, [finalizeCreator, finalizeName, finalizeSession]);

  const handleFinalizeSkip = useCallback(() => {
    void finalizeSession({ catName: '', creatorName: '' });
  }, [finalizeSession]);

  const handleParticipantStatus = useCallback(
    async (participant: ParticipantRecord, status: "active" | "kicked") => {
      try {
        await updateParticipant({
          id: toId("stream_participants", participant.id),
          status,
        });
      } catch (error) {
        console.error("Failed to update participant", error);
        setStatusMessage("Unable to update viewer status.");
      }
    },
    [updateParticipant]
  );

  const viewerLink = useMemo(() => {
    if (!session?.viewer_key) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/streamer-voting/viewer?viewer=${encodeURIComponent(session.viewer_key)}`;
  }, [session?.viewer_key]);

  const sessionParams = session?.params as StreamParams | undefined;
  const signupsOpen = sessionParams?._signupsOpen !== false;
  const votesOpen = sessionParams?._votesOpen === true;
  const currentPaletteMode = sessionParams?._paletteMode ?? "classic";
  const allowDuplicateDevices = session?.allow_repeat_ips === true;

  const finalShareUrl = sessionParams?._finalShareUrl ?? finalShareInfo?.url ?? null;
  const finalCatName = sessionParams?._finalName ?? null;
  const finalCreatorName = sessionParams?._finalCreator ?? null;

  return (
    <div className="flex flex-col gap-8">
      <section className="glass-card grid gap-8 p-6 lg:grid-cols-[1.1fr,1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-eyebrow">Streamer Voting Build</p>
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                Run live sessions with real-time audience votes
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
                  session?.status === "live"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : session?.status === "completed"
                      ? "border-slate-500/50 bg-slate-500/10 text-slate-200"
                      : "border-amber-400/40 bg-amber-400/10 text-amber-100"
                )}
              >
                {session?.status ? session.status.toUpperCase() : "NO SESSION"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStartSession}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="size-4" /> Start new session
            </button>
            {session?.status === "live" && (
              <button
                type="button"
                onClick={handleCompleteSession}
                className="inline-flex items-center gap-2 rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
              >
                <Square className="size-4" /> Finish session
              </button>
            )}
          </div>

          {statusMessage && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm text-primary">
              {statusMessage}
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-background/60 p-4 shadow-inner">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Viewer link</h2>
            {viewerLink ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {viewerLink}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(viewerLink)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold transition hover:bg-border/20"
                >
                  <ClipboardCopy className="size-4" /> Copy
                </button>
                <Link
                  href={viewerLink}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold transition hover:bg-border/20"
                >
                  <ExternalLink className="size-4" /> Open
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Create or resume a session to generate the viewer link.
              </p>
            )}
            {finalShareUrl && (
              <div className="mt-4 space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm text-primary">
                <div className="font-semibold text-primary">Final cat published</div>
                <p className="text-primary/80">
                  {finalCatName ? `“${finalCatName}”` : "This cat"}
                  {finalCreatorName ? ` by ${finalCreatorName}` : ""} is saved in history.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary-foreground/80">
                    {finalShareUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      if (!finalShareUrl) return;
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard
                          .writeText(finalShareUrl)
                          .catch(() => {
                            if (typeof window !== 'undefined') {
                              window.prompt('Copy this link', finalShareUrl);
                            }
                          });
                      } else if (typeof window !== 'undefined') {
                        window.prompt('Copy this link', finalShareUrl);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold transition hover:bg-primary/10 disabled:cursor-not-allowed"
                  >
                    <ClipboardCopy className="size-4" /> Copy
                  </button>
                  <Link
                    href={finalShareUrl}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold transition hover:bg-primary/10"
                  >
                    <ExternalLink className="size-4" /> View
                  </Link>
                  <Link
                    href="/history"
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/50 px-3 py-2 text-xs font-semibold transition hover:bg-primary/10"
                  >
                    <ArrowRight className="size-3" /> History
                  </Link>
                </div>
              </div>
            )}

          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current build</h2>
            <div className="mt-3 flex items-center justify-center">
              <div
                className="relative overflow-hidden rounded-xl border border-border/40 bg-background/70"
                style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              >
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Current build preview"
                    fill
                    sizes={`${PREVIEW_SIZE}px`}
                    className="object-contain"
                    style={{ imageRendering: "pixelated" }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                    Generating preview…
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Leading option</h2>
            <div className="mt-3 flex items-center justify-center">
              <div
                className="relative overflow-hidden rounded-xl border border-border/40 bg-background/70"
                style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              >
                {leaderOption ? (
                  <OptionPreview
                    generator={generator}
                    ready={generatorReady}
                    baseParams={localState.params}
                    step={currentStep}
                    option={leaderOption}
                    allOptions={displayOptions}
                    size={PREVIEW_SIZE}
                  />
                ) : tieOptions.length > 1 ? (
                  <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    Voting is currently tied between {tieOptions.map((row) => row.option.label).join(", ")}. Resolve the tie to preview the result.
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-sm text-muted-foreground">No votes yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card grid gap-6 p-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Current step</h2>
              <p className="text-sm text-muted-foreground">{currentStep?.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSignups}
                disabled={!session || pending || session?.status === "completed"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  signupsOpen
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-100"
                )}
              >
                <Users className="size-3.5" /> {signupsOpen ? "Sign ups open" : "Sign ups closed"}
              </button>
              <button
                type="button"
                onClick={handleToggleVotes}
                disabled={!session || pending || session?.status === "completed"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  votesOpen
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-slate-500/50 bg-slate-500/10 text-slate-200"
                )}
              >
                <Vote className="size-3.5" /> {votesOpen ? "Votes open" : "Votes closed"}
              </button>
              <button
                type="button"
                onClick={handleToggleDuplicateIps}
                disabled={!session || pending || session?.status === "completed"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  allowDuplicateDevices
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-slate-500/50 bg-slate-500/10 text-slate-200"
                )}
              >
                {allowDuplicateDevices ? "Duplicate devices allowed" : "Block duplicate devices"}
              </button>
            </div>
          </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            {currentStep?.id === "colour" && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {COLOUR_PALETTE_MODES.map((mode) => {
                  const active = currentPaletteMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        updateSessionParams((draft) => {
                          draft._paletteMode = mode.id;
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                        active
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="host-option-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Search
              </label>
              <input
                id="host-option-search"
                type="search"
                value={optionSearch}
                onChange={(event) => setOptionSearch(event.target.value)}
                className="flex-1 rounded-lg border border-border/50 bg-background/70 px-3 py-1.5 text-sm focus:border-primary/60 focus:outline-none"
                placeholder="Filter options"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">{totalVotes}</strong> total votes
              </div>
              <div>
                <strong className="text-foreground">{activeParticipantCount}</strong> active viewers
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredVoteRows.length === 0 && (
                <p className="col-span-full rounded-xl border border-border/50 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  No options match your search.
                </p>
              )}
              {filteredVoteRows.map((row) => {
                const isDisabled = disabledOptionsSet.has(row.option.key);
                const inTieFilter = tieFilterSet?.has(row.option.key) ?? false;
                const isTie = tieOptions.some((tie) => tie.option.key === row.option.key);
                const isLeader = leaderKey === row.option.key && !isTie;
                return (
                  <div
                    key={row.option.key}
                    className={cn(
                      "group relative flex flex-col gap-3 rounded-2xl border bg-background/90 p-4 shadow-sm transition",
                      isLeader && "border-primary/60 shadow-primary/20",
                      isTie && "border-amber-400/50 bg-amber-500/5",
                      !isLeader && !isTie && "border-border/60 hover:border-primary/40",
                      isDisabled && "border-border/40 bg-background/50 opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <OptionPreview
                        generator={generator}
                        ready={generatorReady}
                        baseParams={localState.params}
                        step={currentStep}
                        option={row.option}
                        allOptions={displayOptions}
                        size={96}
                      />
                      <div className="flex flex-1 flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{row.option.label}</h3>
                            <p className="text-xs text-muted-foreground">
                              {row.count} vote{row.count === 1 ? "" : "s"}
                              {isTie && " · Tie"}
                              {inTieFilter && " · Tie-break"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleCastStreamerVote(row.option)}
                              disabled={isDisabled}
                              className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold transition hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Vote className="size-3" /> Host vote
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleOptionDisabled(row.option)}
                              className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold transition hover:bg-border/20"
                            >
                              {isDisabled ? "Enable" : "Disable"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleNextStep}
                disabled={!session || pending || hasUnresolvedTie || voteRows.length === 0 || (session?.params?._votesOpen ?? false) || session?.status === "completed"}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowRight className="size-4" /> Next step
              </button>
              {hasUnresolvedTie && (
                <span className="text-xs text-amber-300">Resolve the tie before advancing.</span>
              )}
            </div>

            {(tieOptions.length > 1 || (tieFilterSet && tieFilterSet.size > 0)) && (
              <div className="mt-4 rounded-2xl border border-border/50 bg-background/80 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {tieFilterSet && tieFilterSet.size > 0 ? (
                    <span>Tie-break active for: {Array.from(tieFilterSet).join(", ")}</span>
                  ) : (
                    <span>
                      Tie detected between {tieOptions.map((row) => row.option.label).join(", ")}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleCoinFlip}
                    disabled={tiePair.length !== 2}
                    className="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-2 font-semibold transition hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Coin flip
                  </button>
                  <button
                    type="button"
                    onClick={handleTieRevote}
                    className="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-2 font-semibold transition hover:bg-border/20"
                  >
                    Start tie revote
                  </button>
                  <button
                    type="button"
                    onClick={handleTieClear}
                    disabled={!tieFilterSet || tieFilterSet.size === 0}
                    className="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-2 font-semibold transition hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear tie filter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Session timeline</h3>
          <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-border/60 bg-background/70 p-4 text-sm">
            {localState.history.length === 0 ? (
              <p className="text-muted-foreground">No steps locked yet.</p>
            ) : (
              <ol className="space-y-3">
                {localState.history.map((entry, index) => (
                  <li key={`${entry.step_id ?? entry.option_key ?? index}-${index}`} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Step {index + 1}</div>
                    <div className="font-semibold text-foreground">{entry.title}</div>
                    <div className="text-xs text-muted-foreground">{entry.label}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="glass-card grid gap-6 p-6 lg:grid-cols-[1fr,1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Checked-in viewers</h3>
            <div className="text-xs text-muted-foreground">{participants.length} total</div>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-border/60 bg-background/70">
            {participants.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No viewers have checked in yet.</p>
            ) : (
              <ul className="divide-y divide-border/40 text-sm">
                {participants.map((participant) => {
                  const status = (participant.status ?? "active").toLowerCase();
                  return (
                    <li key={participant.id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <div>
                        <div className="font-semibold text-foreground">{participant.display_name || "Viewer"}</div>
                        <div className="text-xs text-muted-foreground">{status === "active" ? "Active" : "Removed"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {status === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleParticipantStatus(participant, "kicked")}
                            className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold transition hover:bg-border/20"
                          >
                            <ShieldAlert className="size-3" /> Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleParticipantStatus(participant, "active")}
                            className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold transition hover:bg-border/20"
                          >
                            <CheckCircle2 className="size-3" /> Re-admit
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Active or draft sessions</h3>
          <div className="rounded-2xl border border-border/60 bg-background/70">
            {sessionListResolved.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No other sessions available.</p>
            ) : (
              <ul className="divide-y divide-border/40 text-sm">
                {sessionListResolved.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-semibold text-foreground">Session {item.id.slice(-6)}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.status?.toUpperCase()} · {formatRelativeTime(item.updated)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResumeSession(item)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold transition hover:bg-border/20"
                    >
                      <RefreshCw className="size-3" /> Resume
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {finalizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-border/60 bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Save the final build</h3>
            <p className="mt-2 text-sm text-muted-foreground">Provide an optional name and creator before publishing this cat to history.</p>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label htmlFor="final-cat-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cat name</label>
                <input
                  id="final-cat-name"
                  type="text"
                  value={finalizeName}
                  onChange={(event) => setFinalizeName(event.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="final-creator-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creator</label>
                <input
                  id="final-creator-name"
                  type="text"
                  value={finalizeCreator}
                  onChange={(event) => setFinalizeCreator(event.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>
            {finalizeError && (
              <p className="mt-3 text-sm text-destructive">{finalizeError}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleFinalizeSkip}
                disabled={finalizeSaving}
                className="inline-flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip naming
              </button>
              <button
                type="button"
                onClick={handleFinalizeSubmit}
                disabled={finalizeSaving}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {finalizeSaving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save &amp; finish
              </button>
            </div>
          </div>
        </div>
      )}

      {coinModalOpen && tiePair.length === 2 && currentStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-border/60 bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Coin Flip Tie-breaker</h3>
              <button
                type="button"
                onClick={() => (!coinFlipping ? setCoinModalOpen(false) : null)}
                className="rounded-full border border-border/50 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-border/10 disabled:opacity-50"
                disabled={coinFlipping}
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Winner receives an extra streamer vote to resolve the tie.</p>
            <div className="mt-6 flex flex-col items-center gap-6">
              <div className="coin-stage">
                <div
                  key={coinFlipId}
                  className={`coin-3d ${coinOrientation} ${coinFlipping && coinWinner ? "coin-flipping" : ""}`.trim()}
                  onAnimationEnd={handleCoinAnimationEnd}
                  aria-live="polite"
                >
                  <div className="coin-face coin-face-front">
                    {frontOption && currentStep && (
                      <OptionPreview
                        generator={generator}
                        ready={generatorReady}
                        baseParams={localState.params}
                        step={currentStep}
                        option={frontOption}
                        allOptions={displayOptions}
                        size={COIN_FACE_SIZE}
                      />
                    )}
                  </div>
                  <div className="coin-face coin-face-back">
                    {backOption && currentStep && (
                      <OptionPreview
                        generator={generator}
                        ready={generatorReady}
                        baseParams={localState.params}
                        step={currentStep}
                        option={backOption}
                        allOptions={displayOptions}
                        size={COIN_FACE_SIZE}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div
                  className={cn(
                    "rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-center",
                    coinResult?.option.key === frontOption?.key && "border-primary/60 text-primary font-semibold"
                  )}
                >
                  Heads: {frontOption?.label ?? "—"}
                </div>
                <div
                  className={cn(
                    "rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-center",
                    coinResult?.option.key === backOption?.key && "border-primary/60 text-primary font-semibold"
                  )}
                >
                  Tails: {backOption?.label ?? "—"}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{coinMessage}</div>
              <button
                type="button"
                onClick={executeCoinFlip}
                disabled={coinFlipping || voteSent}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {coinFlipping ? "Flipping" : voteSent ? "Vote recorded" : "Flip coin"}
              </button>
            </div>
            <style jsx>{`
              .coin-stage {
                perspective: 1200px;
                width: ${PREVIEW_SIZE}px;
                height: ${PREVIEW_SIZE}px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              .coin-3d {
                position: relative;
                width: ${PREVIEW_SIZE}px;
                height: ${PREVIEW_SIZE}px;
                transform-style: preserve-3d;
                transition: transform 0.5s ease-out;
              }

              .coin-3d.show-front {
                transform: rotateY(0deg);
              }

              .coin-3d.show-back {
                transform: rotateY(180deg);
              }

              .coin-3d.coin-flipping.show-front {
                animation: flip-to-front 1.35s ease-out forwards;
              }

              .coin-3d.coin-flipping.show-back {
                animation: flip-to-back 1.35s ease-out forwards;
              }

              .coin-face {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                backface-visibility: hidden;
                background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.35), rgba(0, 0, 0, 0.45));
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
              }

              .coin-face.coin-face-back {
                transform: rotateY(180deg);
              }

              .coin-face :global(.relative) {
                width: ${COIN_FACE_SIZE}px;
                height: ${COIN_FACE_SIZE}px;
                border-radius: 50%;
                border: none !important;
                background: transparent !important;
                box-shadow: none !important;
              }

              .coin-face :global(img) {
                object-fit: contain;
                image-rendering: pixelated;
              }

              @keyframes flip-to-front {
                from {
                  transform: rotateY(0deg);
                }
                to {
                  transform: rotateY(1800deg);
                }
              }

              @keyframes flip-to-back {
                from {
                  transform: rotateY(0deg);
                }
                to {
                  transform: rotateY(1980deg);
                }
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}

export default HostClient;
