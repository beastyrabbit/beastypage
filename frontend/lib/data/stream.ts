"use client";

import { useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { useLive } from "@/lib/live";
import type { getCatStreamSession } from "@/server/services/catStream";
import type {
  createStreamParticipant,
  createStreamSession,
  createStreamVote,
  getStreamSession,
  listStreamParticipants,
  listStreamSessions,
  listStreamVotes,
  updateStreamParticipant,
  updateStreamSession,
} from "@/server/services/stream";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

const get = <T>(
  url: string,
  signal?: AbortSignal,
  options?: { nullable?: boolean },
) => fetchJson<T>(url, { signal, ...options });
const post = <T>(url: string, body: unknown) =>
  fetchJson<T>(url, { method: "POST", body });

export type StreamSession = NonNullable<
  Awaited<ReturnType<typeof getStreamSession>>
>;
export type StreamParticipant = Awaited<
  ReturnType<typeof listStreamParticipants>
>[number];
export type StreamVote = Awaited<ReturnType<typeof listStreamVotes>>[number];
export type StreamSessionListArgs = Parameters<typeof listStreamSessions>[1];
export type StreamSessionArgs = { id: string };
export type StreamParticipantListArgs = Parameters<
  typeof listStreamParticipants
>[1];
export type StreamVoteListArgs = Parameters<typeof listStreamVotes>[1];
export type CreateStreamSessionArgs = Omit<
  Parameters<typeof createStreamSession>[1],
  "params"
> & {
  params?: unknown;
};
export type UpdateStreamSessionArgs = Omit<
  Parameters<typeof updateStreamSession>[1],
  "params"
> & {
  params?: unknown;
};
export type CreateStreamParticipantArgs = Parameters<
  typeof createStreamParticipant
>[1];
export type UpdateStreamParticipantArgs = Parameters<
  typeof updateStreamParticipant
>[1];
export type CreateStreamVoteArgs = Parameters<typeof createStreamVote>[1];
export type CatStreamSession = NonNullable<
  Awaited<ReturnType<typeof getCatStreamSession>>
>;

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
        get<CatStreamSession>("/api/cat-stream", signal, { nullable: true }),
      enabled,
    },
  );
  let sessionId: string | null = null;
  if (query) sessionId = String(query.id);
  const live = useLive<CatStreamSession>(
    sessionId ? `cat-stream/${sessionId}` : null,
    {
      enabled: enabled,
    },
  );
  return live ?? query;
}

export function useCatStreamSessionByApiKey(apiKey: string, enabled = true) {
  const query = useDataQuery(
    { apiKey },
    {
      queryKey: dataQueryKeys.detail("catStream.overlay", apiKey),
      queryFn: (args, signal) =>
        get<CatStreamSession>(
          `/api/cat-stream?key=${encodeURIComponent(args.apiKey)}`,
          signal,
          { nullable: true },
        ),
      enabled: enabled && Boolean(apiKey),
    },
  );
  let sessionId: string | null = null;
  if (query) sessionId = String(query.id);
  const eventSource = useMemo(
    () => (url: string) =>
      new EventSource(`${url}?key=${encodeURIComponent(apiKey)}`),
    [apiKey],
  );
  const live = useLive<CatStreamSession>(
    sessionId ? `cat-stream/${sessionId}` : null,
    {
      enabled: enabled && Boolean(sessionId),
      eventSource,
    },
  );
  return live ?? query;
}

function catMutation(operation: string) {
  return (args: Record<string, unknown>) =>
    post<unknown>("/api/cat-stream", { operation, ...args });
}

export const useEnsureCatStreamSession = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("ensureSession")(args as Record<string, unknown>),
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useUpdateCatStreamSettings = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("updateSettings")(args as Record<string, unknown>),
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useMergeCatStreamSettings = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("mergeSettings")(args as Record<string, unknown>),
    invalidate: [dataQueryKeys.query("catStream.session")],
  });
export const useTriggerCatStreamSpin = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("triggerSpin")(args as Record<string, unknown>),
  });
export const useAttachCatStreamViewSlug = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("attachViewSlug")(args as Record<string, unknown>),
  });
export const useTriggerCatStreamWheel = () =>
  useDataMutation<Record<string, never>, unknown>({
    mutationFn: () => catMutation("triggerWheel")({}),
  });
export const useShowLobby = () =>
  useDataMutation<Record<string, never>, unknown>({
    mutationFn: () => catMutation("showLobby")({}),
  });
export const useShowBrb = () =>
  useDataMutation<Record<string, never>, unknown>({
    mutationFn: () => catMutation("showBrb")({}),
  });
export const useClearOverlay = () =>
  useDataMutation<Record<string, never>, unknown>({
    mutationFn: () => catMutation("clearOverlay")({}),
  });
export const useToggleTestMode = () =>
  useDataMutation<Record<string, never>, unknown>({
    mutationFn: () => catMutation("toggleTestMode")({}),
  });
export const useTriggerCatStreamEvolution = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("triggerEvolution")(args as Record<string, unknown>),
  });
export const useTriggerCatStreamBatch = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("triggerBatch")(args as Record<string, unknown>),
  });
export const useReportBatchStage = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("reportBatchStage")(args as Record<string, unknown>),
  });
export const useMarkBatchCat = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("markBatchCat")(args as Record<string, unknown>),
  });
export const useSetBatchHighlight = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("setBatchHighlight")(args as Record<string, unknown>),
  });
export const useCullBatchCat = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("cullBatchCat")(args as Record<string, unknown>),
  });
export const useCancelBatchCull = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("cancelBatchCull")(args as Record<string, unknown>),
  });
export const useHoldEvolution = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("holdEvolution")(args as Record<string, unknown>),
  });
export const useReleaseEvolution = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("releaseEvolution")(args as Record<string, unknown>),
  });
export const useRevealEvolutionAt = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("revealEvolutionAt")(args as Record<string, unknown>),
  });
export const useSkipEvolutionToBoard = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("skipEvolutionToBoard")(args as Record<string, unknown>),
  });
export const useAttachBatchSlug = () =>
  useDataMutation<Record<string, unknown>, unknown>({
    mutationFn: (args) =>
      catMutation("attachBatchSlug")(args as Record<string, unknown>),
  });

export function useStreamSessions(args: StreamSessionListArgs | "skip") {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.list(
      "stream.sessions",
      args === "skip" ? {} : args,
    ),
    queryFn: (input, signal) =>
      get<StreamSession[]>(
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
    session: StreamSession | null;
    participants: StreamParticipant[];
    votes: StreamVote[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.session ? [live.session] : query;
}

export function useStreamSession(
  args: StreamSessionArgs | "skip",
  viewerKey?: string | null,
) {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.detail(
      "stream.session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<StreamSession>(`/api/stream/sessions/${String(input.id)}`, signal, {
        nullable: true,
      }),
  });
  const id = args === "skip" ? null : String(args.id);
  const eventSource = useKeyedEventSource(viewerKey);
  const live = useLive<{
    session: StreamSession | null;
    participants: StreamParticipant[];
    votes: StreamVote[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.session ? live.session : query;
}

export function useStreamSessionForHost(args: StreamSessionArgs | "skip") {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.detail(
      "stream.host-session",
      args === "skip" ? "none" : String(args.id),
    ),
    queryFn: (input, signal) =>
      get<StreamSession>(
        `/api/stream/sessions/${String(input.id)}?host=1`,
        signal,
        {
          nullable: true,
        },
      ),
  });
  const id = args === "skip" ? null : String(args.id);
  const live = useLive<{
    session: StreamSession | null;
    participants: StreamParticipant[];
    votes: StreamVote[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
  });
  return live?.session ? live.session : query;
}
export function useStreamParticipants(
  args: StreamParticipantListArgs | "skip",
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
      return get<StreamParticipant[]>(
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
    participants: StreamParticipant[];
    session: StreamSession | null;
    votes: StreamVote[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.participants ? live.participants : query;
}
export function useStreamVotes(
  args: StreamVoteListArgs | "skip",
  viewerKey?: string | null,
) {
  const query = useDataQuery(args, {
    queryKey: dataQueryKeys.list("stream.votes", args === "skip" ? {} : args),
    queryFn: (input, signal) => {
      const stepParam = input.stepId
        ? `stepId=${encodeURIComponent(input.stepId)}&`
        : "";
      return get<StreamVote[]>(
        `/api/stream/votes?session=${String(input.session)}&${stepParam}limit=${input.limit}`,
        signal,
      );
    },
  });
  const id = args === "skip" ? null : String(args.session);
  const stepId = args === "skip" ? undefined : args.stepId;
  const eventSource = useKeyedEventSource(viewerKey, "stepId", stepId);
  const live = useLive<{
    votes: StreamVote[];
    session: StreamSession | null;
    participants: StreamParticipant[];
  }>(id ? `stream/${id}` : null, {
    enabled: Boolean(id),
    eventSource,
  });
  return live?.votes ? live.votes : query;
}
export const useCreateStreamSession = () =>
  useDataMutation<
    CreateStreamSessionArgs,
    Awaited<ReturnType<typeof createStreamSession>>
  >({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof createStreamSession>>>(
        "/api/stream/sessions",
        { operation: "create", ...args },
      ),
    invalidate: [dataQueryKeys.list("stream.sessions", {})],
  });
export const useUpdateStreamSession = () =>
  useDataMutation<
    UpdateStreamSessionArgs,
    Awaited<ReturnType<typeof updateStreamSession>>
  >({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof updateStreamSession>>>(
        "/api/stream/sessions",
        { operation: "update", ...args },
      ),
  });
export const useCreateStreamParticipant = () =>
  useDataMutation<
    CreateStreamParticipantArgs,
    Awaited<ReturnType<typeof createStreamParticipant>>
  >({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof createStreamParticipant>>>(
        "/api/stream/participants",
        { operation: "create", ...args },
      ),
  });
export const useUpdateStreamParticipant = () =>
  useDataMutation<
    UpdateStreamParticipantArgs,
    Awaited<ReturnType<typeof updateStreamParticipant>>
  >({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof updateStreamParticipant>>>(
        "/api/stream/participants",
        { operation: "update", ...args },
      ),
  });
export const useCreateStreamVote = () =>
  useDataMutation<
    CreateStreamVoteArgs,
    Awaited<ReturnType<typeof createStreamVote>>
  >({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof createStreamVote>>>(
        "/api/stream/votes",
        args,
      ),
  });
