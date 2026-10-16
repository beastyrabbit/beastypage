"use client";

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { fetchJson } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useDataBackend } from "./backend";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

const get = <T>(url: string, signal?: AbortSignal) =>
  fetchJson<T>(url, { signal });
const post = <T>(url: string, body: unknown) =>
  fetchJson<T>(url, { method: "POST", body });

function useKeyedEventSource(
  key: string | null | undefined,
  extraName?: string,
  extraValue?: string,
) {
  return useMemo(
    () =>
      key
        ? (url: string) => {
            const params = new URLSearchParams({ viewerKey: key });
            if (extraName && extraValue) params.set(extraName, extraValue);
            return new EventSource(`${url}?${params.toString()}`);
          }
        : undefined,
    [key, extraName, extraValue],
  );
}

export function useCatStreamSession(enabled = true) {
  const backend = useDataBackend();
  const query = useDataQuery(
    api.catStream.getSession,
    {},
    {
      queryKey: dataQueryKeys.query("catStream.session"),
      queryFn: (_, signal) =>
        get<FunctionReturnType<typeof api.catStream.getSession>>(
          "/api/cat-stream",
          signal,
        ),
      enabled,
    },
  );
  const sessionId = query
    ? "id" in query
      ? query.id
      : String(query._id)
    : null;
  const live = useLive<FunctionReturnType<typeof api.catStream.getSession>>(
    sessionId ? `cat-stream/${sessionId}` : null,
    { enabled: backend === "postgres" && enabled },
  );
  return backend === "postgres" ? (live ?? query) : query;
}

export function useCatStreamSessionByApiKey(apiKey: string, enabled = true) {
  const backend = useDataBackend();
  const query = useDataQuery(
    api.catStream.getSessionByApiKey,
    { apiKey },
    {
      queryKey: dataQueryKeys.detail("catStream.overlay", apiKey),
      queryFn: (args, signal) =>
        get<FunctionReturnType<typeof api.catStream.getSessionByApiKey>>(
          `/api/cat-stream?key=${encodeURIComponent(args.apiKey)}`,
          signal,
        ),
      enabled: enabled && Boolean(apiKey),
    },
  );
  const sessionId = query
    ? "id" in query
      ? query.id
      : String(query._id)
    : null;
  const eventSource = useMemo(
    () => (url: string) =>
      new EventSource(`${url}?key=${encodeURIComponent(apiKey)}`),
    [apiKey],
  );
  const live = useLive<
    FunctionReturnType<typeof api.catStream.getSessionByApiKey>
  >(sessionId ? `cat-stream/${sessionId}` : null, {
    enabled: backend === "postgres" && enabled && Boolean(sessionId),
    eventSource,
  });
  return backend === "postgres" ? (live ?? query) : query;
}

function catMutation(operation: string) {
  return (args: Record<string, unknown>) =>
    post<unknown>("/api/cat-stream", { operation, ...args });
}

export const useEnsureCatStreamSession = () =>
  useDataMutation(api.catStream.ensureSession, {
    mutationFn: (args) =>
      catMutation("ensureSession")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.ensureSession>
      >,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useUpdateCatStreamSettings = () =>
  useDataMutation(api.catStream.updateSettings, {
    mutationFn: (args) =>
      catMutation("updateSettings")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.updateSettings>
      >,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useMergeCatStreamSettings = () =>
  useDataMutation(api.catStream.mergeSettings, {
    mutationFn: (args) =>
      catMutation("mergeSettings")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.mergeSettings>
      >,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useTriggerCatStreamSpin = () =>
  useDataMutation(api.catStream.triggerSpin, {
    mutationFn: (args) =>
      catMutation("triggerSpin")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.triggerSpin>
      >,
  });
export const useAttachCatStreamViewSlug = () =>
  useDataMutation(api.catStream.attachViewSlug, {
    mutationFn: (args) =>
      catMutation("attachViewSlug")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.attachViewSlug>
      >,
  });
export const useTriggerCatStreamWheel = () =>
  useDataMutation(api.catStream.triggerWheel, {
    mutationFn: () =>
      catMutation("triggerWheel")({}) as Promise<
        FunctionReturnType<typeof api.catStream.triggerWheel>
      >,
  });
export const useShowLobby = () =>
  useDataMutation(api.catStream.showLobby, {
    mutationFn: () =>
      catMutation("showLobby")({}) as Promise<
        FunctionReturnType<typeof api.catStream.showLobby>
      >,
  });
export const useShowBrb = () =>
  useDataMutation(api.catStream.showBrb, {
    mutationFn: () =>
      catMutation("showBrb")({}) as Promise<
        FunctionReturnType<typeof api.catStream.showBrb>
      >,
  });
export const useClearOverlay = () =>
  useDataMutation(api.catStream.clearOverlay, {
    mutationFn: () =>
      catMutation("clearOverlay")({}) as Promise<
        FunctionReturnType<typeof api.catStream.clearOverlay>
      >,
  });
export const useToggleTestMode = () =>
  useDataMutation(api.catStream.toggleTestMode, {
    mutationFn: () =>
      catMutation("toggleTestMode")({}) as Promise<
        FunctionReturnType<typeof api.catStream.toggleTestMode>
      >,
  });
export const useTriggerCatStreamEvolution = () =>
  useDataMutation(api.catStream.triggerEvolution, {
    mutationFn: (args) =>
      catMutation("triggerEvolution")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.triggerEvolution>>,
  });
export const useTriggerCatStreamBatch = () =>
  useDataMutation(api.catStream.triggerBatch, {
    mutationFn: (args) =>
      catMutation("triggerBatch")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.triggerBatch>
      >,
  });
export const useReportBatchStage = () =>
  useDataMutation(api.catStream.reportBatchStage, {
    mutationFn: (args) =>
      catMutation("reportBatchStage")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.reportBatchStage>>,
  });
export const useMarkBatchCat = () =>
  useDataMutation(api.catStream.markBatchCat, {
    mutationFn: (args) =>
      catMutation("markBatchCat")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.markBatchCat>
      >,
  });
export const useSetBatchHighlight = () =>
  useDataMutation(api.catStream.setBatchHighlight, {
    mutationFn: (args) =>
      catMutation("setBatchHighlight")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.setBatchHighlight>>,
  });
export const useCullBatchCat = () =>
  useDataMutation(api.catStream.cullBatchCat, {
    mutationFn: (args) =>
      catMutation("cullBatchCat")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.cullBatchCat>
      >,
  });
export const useCancelBatchCull = () =>
  useDataMutation(api.catStream.cancelBatchCull, {
    mutationFn: (args) =>
      catMutation("cancelBatchCull")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.cancelBatchCull>>,
  });
export const useHoldEvolution = () =>
  useDataMutation(api.catStream.holdEvolution, {
    mutationFn: (args) =>
      catMutation("holdEvolution")(args as Record<string, unknown>) as Promise<
        FunctionReturnType<typeof api.catStream.holdEvolution>
      >,
  });
export const useReleaseEvolution = () =>
  useDataMutation(api.catStream.releaseEvolution, {
    mutationFn: (args) =>
      catMutation("releaseEvolution")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.releaseEvolution>>,
  });
export const useRevealEvolutionAt = () =>
  useDataMutation(api.catStream.revealEvolutionAt, {
    mutationFn: (args) =>
      catMutation("revealEvolutionAt")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.revealEvolutionAt>>,
  });
export const useSkipEvolutionToBoard = () =>
  useDataMutation(api.catStream.skipEvolutionToBoard, {
    mutationFn: (args) =>
      catMutation("skipEvolutionToBoard")(
        args as Record<string, unknown>,
      ) as Promise<
        FunctionReturnType<typeof api.catStream.skipEvolutionToBoard>
      >,
  });
export const useAttachBatchSlug = () =>
  useDataMutation(api.catStream.attachBatchSlug, {
    mutationFn: (args) =>
      catMutation("attachBatchSlug")(
        args as Record<string, unknown>,
      ) as Promise<FunctionReturnType<typeof api.catStream.attachBatchSlug>>,
  });

export function useStreamSessions(
  args: FunctionArgs<typeof api.streamSessionsV2.list> | "skip",
) {
  const backend = useDataBackend();
  const query = useDataQuery(api.streamSessionsV2.list, args, {
    queryKey: dataQueryKeys.list(
      "stream.sessions",
      args === "skip" ? {} : args,
    ),
    queryFn: (input, signal) =>
      get<FunctionReturnType<typeof api.streamSessionsV2.list>>(
        `/api/stream/sessions?${new URLSearchParams(
          Object.entries(input)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )}`,
        signal,
      ),
  });
  const id = query?.[0]?.id;
  const viewerKey = args === "skip" ? undefined : args.viewerKey;
  const eventSource = useKeyedEventSource(viewerKey);
  const live = useLive<{
    session: FunctionReturnType<typeof api.streamSessionsV2.get> | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: backend === "postgres" && Boolean(id),
    eventSource,
  });
  return backend === "postgres" && live?.session ? [live.session] : query;
}

export function useStreamSession(
  args: FunctionArgs<typeof api.streamSessionsV2.get> | "skip",
  viewerKey?: string | null,
) {
  const backend = useDataBackend();
  const query = useDataQuery(api.streamSessionsV2.get, args, {
    queryKey: dataQueryKeys.detail(
      "stream.session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<FunctionReturnType<typeof api.streamSessionsV2.get>>(
        `/api/stream/sessions/${String(input.id)}`,
        signal,
      ),
  });
  const id = args === "skip" ? null : String(args.id);
  const eventSource = useKeyedEventSource(viewerKey);
  const live = useLive<{
    session: FunctionReturnType<typeof api.streamSessionsV2.get> | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: backend === "postgres" && Boolean(id),
    eventSource,
  });
  return backend === "postgres" && live?.session ? live.session : query;
}

export function useStreamSessionForHost(
  args: FunctionArgs<typeof api.streamSessionsV2.getForHost> | "skip",
) {
  const backend = useDataBackend();
  const query = useDataQuery(api.streamSessionsV2.getForHost, args, {
    queryKey: dataQueryKeys.detail(
      "stream.host-session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<FunctionReturnType<typeof api.streamSessionsV2.getForHost>>(
        `/api/stream/sessions/${String(input.id)}?host=1`,
        signal,
      ),
  });
  const id = args === "skip" ? null : String(args.id);
  const live = useLive<{
    session: FunctionReturnType<typeof api.streamSessionsV2.get> | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: backend === "postgres" && Boolean(id),
  });
  return backend === "postgres" && live?.session ? live.session : query;
}
export function useStreamParticipants(
  args: FunctionArgs<typeof api.streamParticipantsV2.list> | "skip",
  viewerKey?: string | null,
) {
  const backend = useDataBackend();
  const query = useDataQuery(api.streamParticipantsV2.list, args, {
    queryKey: dataQueryKeys.list(
      "stream.participants",
      args === "skip" ? {} : args,
    ),
    queryFn: (input, signal) =>
      get<FunctionReturnType<typeof api.streamParticipantsV2.list>>(
        `/api/stream/participants?session=${String(input.session)}&${input.viewerSession ? `viewerSession=${encodeURIComponent(input.viewerSession)}&` : ""}limit=${input.limit}`,
        signal,
      ),
  });
  const id = args === "skip" ? null : String(args.session);
  const viewerSession = args === "skip" ? undefined : args.viewerSession;
  const eventSource = useKeyedEventSource(
    viewerKey,
    "viewerSession",
    viewerSession,
  );
  const live = useLive<{
    participants: FunctionReturnType<typeof api.streamParticipantsV2.list>;
    session: unknown;
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: backend === "postgres" && Boolean(id),
    eventSource,
  });
  return backend === "postgres" && live?.participants
    ? live.participants
    : query;
}
export function useStreamVotes(
  args: FunctionArgs<typeof api.streamVotesV2.list> | "skip",
  viewerKey?: string | null,
) {
  const backend = useDataBackend();
  const query = useDataQuery(api.streamVotesV2.list, args, {
    queryKey: dataQueryKeys.list("stream.votes", args === "skip" ? {} : args),
    queryFn: (input, signal) =>
      get<FunctionReturnType<typeof api.streamVotesV2.list>>(
        `/api/stream/votes?session=${String(input.session)}&${input.stepId ? `stepId=${encodeURIComponent(input.stepId)}&` : ""}limit=${input.limit}`,
        signal,
      ),
  });
  const id = args === "skip" ? null : String(args.session);
  const stepId = args === "skip" ? undefined : args.stepId;
  const eventSource = useKeyedEventSource(viewerKey, "stepId", stepId);
  const live = useLive<{
    votes: FunctionReturnType<typeof api.streamVotesV2.list>;
    session: unknown;
    participants: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: backend === "postgres" && Boolean(id),
    eventSource,
  });
  return backend === "postgres" && live?.votes ? live.votes : query;
}
export const useCreateStreamSession = () =>
  useDataMutation(api.streamSessionsV2.create, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.streamSessionsV2.create>>(
        "/api/stream/sessions",
        { operation: "create", ...args },
      ),
    invalidate: [dataQueryKeys.list("stream.sessions", {})],
  });
export const useUpdateStreamSession = () =>
  useDataMutation(api.streamSessionsV2.update, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.streamSessionsV2.update>>(
        "/api/stream/sessions",
        { operation: "update", ...args },
      ),
  });
export const useCreateStreamParticipant = () =>
  useDataMutation(api.streamParticipantsV2.create, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.streamParticipantsV2.create>>(
        "/api/stream/participants",
        { operation: "create", ...args },
      ),
  });
export const useUpdateStreamParticipant = () =>
  useDataMutation(api.streamParticipantsV2.update, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.streamParticipantsV2.update>>(
        "/api/stream/participants",
        { operation: "update", ...args },
      ),
  });
export const useCreateStreamVote = () =>
  useDataMutation(api.streamVotesV2.create, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.streamVotesV2.create>>(
        "/api/stream/votes",
        args,
      ),
  });
