"use client";

import { useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

const get = <T>(
  url: string,
  signal?: AbortSignal,
  options?: { nullable?: boolean },
) => fetchJson<T>(url, { signal, ...options });
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
  const query = useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.query("catStream.session"),
      queryFn: (_, signal) =>
        get<any>("/api/cat-stream", signal, { nullable: true }),
      enabled,
    },
  );
  let sessionId: string | null = null;
  if (query) sessionId = "id" in query ? String(query.id) : String(query._id);
  const live = useLive<any>(sessionId ? `cat-stream/${sessionId}` : null, {
    enabled: enabled,
  });
  return live ?? query;
}

export function useCatStreamSessionByApiKey(apiKey: string, enabled = true) {
  const query = useDataQuery(
    { apiKey },
    {
      queryKey: dataQueryKeys.detail("catStream.overlay", apiKey),
      queryFn: (args, signal) =>
        get<any>(
          `/api/cat-stream?key=${encodeURIComponent(args.apiKey)}`,
          signal,
          { nullable: true },
        ),
      enabled: enabled && Boolean(apiKey),
    },
  );
  let sessionId: string | null = null;
  if (query) sessionId = "id" in query ? String(query.id) : String(query._id);
  const eventSource = useMemo(
    () => (url: string) =>
      new EventSource(`${url}?key=${encodeURIComponent(apiKey)}`),
    [apiKey],
  );
  const live = useLive<any>(sessionId ? `cat-stream/${sessionId}` : null, {
    enabled: enabled && Boolean(sessionId),
    eventSource,
  });
  return live ?? query;
}

function catMutation(operation: string) {
  return (args: Record<string, unknown>) =>
    post<unknown>("/api/cat-stream", { operation, ...args });
}

export const useEnsureCatStreamSession = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("ensureSession")(
        args as Record<string, unknown>,
      ) as Promise<any>,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useUpdateCatStreamSettings = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("updateSettings")(
        args as Record<string, unknown>,
      ) as Promise<any>,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useMergeCatStreamSettings = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("mergeSettings")(
        args as Record<string, unknown>,
      ) as Promise<any>,
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useTriggerCatStreamSpin = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("triggerSpin")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useAttachCatStreamViewSlug = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("attachViewSlug")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useTriggerCatStreamWheel = () =>
  useDataMutation({
    mutationFn: () => catMutation("triggerWheel")({}) as Promise<any>,
  });
export const useShowLobby = () =>
  useDataMutation({
    mutationFn: () => catMutation("showLobby")({}) as Promise<any>,
  });
export const useShowBrb = () =>
  useDataMutation({
    mutationFn: () => catMutation("showBrb")({}) as Promise<any>,
  });
export const useClearOverlay = () =>
  useDataMutation({
    mutationFn: () => catMutation("clearOverlay")({}) as Promise<any>,
  });
export const useToggleTestMode = () =>
  useDataMutation({
    mutationFn: () => catMutation("toggleTestMode")({}) as Promise<any>,
  });
export const useTriggerCatStreamEvolution = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("triggerEvolution")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useTriggerCatStreamBatch = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("triggerBatch")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useReportBatchStage = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("reportBatchStage")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useMarkBatchCat = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("markBatchCat")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useSetBatchHighlight = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("setBatchHighlight")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useCullBatchCat = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("cullBatchCat")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useCancelBatchCull = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("cancelBatchCull")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useHoldEvolution = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("holdEvolution")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useReleaseEvolution = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("releaseEvolution")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useRevealEvolutionAt = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("revealEvolutionAt")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useSkipEvolutionToBoard = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("skipEvolutionToBoard")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });
export const useAttachBatchSlug = () =>
  useDataMutation({
    mutationFn: (args) =>
      catMutation("attachBatchSlug")(
        args as Record<string, unknown>,
      ) as Promise<any>,
  });

export function useStreamSessions(args: any | "skip") {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.list(
      "stream.sessions",
      args === "skip" ? {} : args,
    ),
    queryFn: (input, signal) =>
      get<any>(
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
    session: any | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.session ? [live.session] : query;
}

export function useStreamSession(
  args: any | "skip",
  viewerKey?: string | null,
) {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.detail(
      "stream.session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<any>(`/api/stream/sessions/${String(input.id)}`, signal, {
        nullable: true,
      }),
  });
  const id = args === "skip" ? null : String(args.id);
  const eventSource = useKeyedEventSource(viewerKey);
  const live = useLive<{
    session: any | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.session ? live.session : query;
}

export function useStreamSessionForHost(args: any | "skip") {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.detail(
      "stream.host-session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<any>(`/api/stream/sessions/${String(input.id)}?host=1`, signal, {
        nullable: true,
      }),
  });
  const id = args === "skip" ? null : String(args.id);
  const live = useLive<{
    session: any | null;
    participants: unknown[];
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
  });
  return live?.session ? live.session : query;
}
export function useStreamParticipants(
  args: any | "skip",
  viewerKey?: string | null,
) {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.list(
      "stream.participants",
      args === "skip" ? {} : args,
    ),
    queryFn: (input, signal) => {
      const viewerParam = input.viewerSession
        ? `viewerSession=${encodeURIComponent(input.viewerSession)}&`
        : "";
      return get<any>(
        `/api/stream/participants?session=${String(input.session)}&${viewerParam}limit=${input.limit}`,
        signal,
      );
    },
  });
  const id = args === "skip" ? null : String(args.session);
  const viewerSession = args === "skip" ? undefined : args.viewerSession;
  const eventSource = useKeyedEventSource(
    viewerKey,
    "viewerSession",
    viewerSession,
  );
  const live = useLive<{
    participants: any;
    session: unknown;
    votes: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.participants ? live.participants : query;
}
export function useStreamVotes(args: any | "skip", viewerKey?: string | null) {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.list("stream.votes", args === "skip" ? {} : args),
    queryFn: (input, signal) => {
      const stepParam = input.stepId
        ? `stepId=${encodeURIComponent(input.stepId)}&`
        : "";
      return get<any>(
        `/api/stream/votes?session=${String(input.session)}&${stepParam}limit=${input.limit}`,
        signal,
      );
    },
  });
  const id = args === "skip" ? null : String(args.session);
  const stepId = args === "skip" ? undefined : args.stepId;
  const eventSource = useKeyedEventSource(viewerKey, "stepId", stepId);
  const live = useLive<{
    votes: any;
    session: unknown;
    participants: unknown[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.votes ? live.votes : query;
}
export const useCreateStreamSession = () =>
  useDataMutation({
    mutationFn: (args) =>
      post<any>("/api/stream/sessions", { operation: "create", ...args }),
    invalidate: [dataQueryKeys.list("stream.sessions", {})],
  });
export const useUpdateStreamSession = () =>
  useDataMutation({
    mutationFn: (args) =>
      post<any>("/api/stream/sessions", { operation: "update", ...args }),
  });
export const useCreateStreamParticipant = () =>
  useDataMutation({
    mutationFn: (args) =>
      post<any>("/api/stream/participants", { operation: "create", ...args }),
  });
export const useUpdateStreamParticipant = () =>
  useDataMutation({
    mutationFn: (args) =>
      post<any>("/api/stream/participants", { operation: "update", ...args }),
  });
export const useCreateStreamVote = () =>
  useDataMutation({
    mutationFn: (args) => post<any>("/api/stream/votes", args),
  });
