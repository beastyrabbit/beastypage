"use client";

import { fetchJson } from "@/lib/api";
import { dataQueryKeys, useDataMutation, useDataQuery } from "@/lib/data";
import type {
  perfectLeaderboard,
  requestPerfectMatchup,
  submitPerfectVote,
  wheelStats,
} from "@/server/services/games";

type Matchup = Awaited<ReturnType<typeof requestPerfectMatchup>>;
type PerfectVote = Awaited<ReturnType<typeof submitPerfectVote>>;
type Leaderboard = Awaited<ReturnType<typeof perfectLeaderboard>>;
type WheelStats = Awaited<ReturnType<typeof wheelStats>>;

export function usePerfectCatRegister() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<unknown>("/api/perfect-cats/register", {
        method: "POST",
        body: args,
        signal,
      }),
  });
}

export function usePerfectCatMatchup() {
  return useDataMutation({
    mutationFn: (value, signal) =>
      fetchJson<Matchup>("/api/perfect-cats/matchup", {
        method: "POST",
        body: value,
        signal,
      }),
  });
}

export function usePerfectCatVote() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<PerfectVote>("/api/perfect-cats/vote", {
        method: "POST",
        body: args,
        signal,
      }),
  });
}

export function usePerfectCatLeaderboard(limit = 10) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("perfect-cats-leaderboard", limit),
      queryFn: (_args, signal) =>
        fetchJson<Leaderboard>(`/api/perfect-cats/leaderboard?limit=${limit}`, {
          signal,
        }),
    },
  );
}

export function useCoinflipLeaderboard(limit = 10) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("coinflip-leaderboard", limit),
      queryFn: (_args, signal) =>
        fetchJson<
          Array<{ id: string; name: string; score: number; createdAt: number }>
        >(`/api/coinflip/leaderboard?limit=${limit}`, { signal }),
    },
  );
}

export function useCoinflipScores(limit = 200) {
  return useDataQuery(
    { limit },
    {
      queryKey: dataQueryKeys.list("coinflip-scores", limit),
      queryFn: (_args, signal) =>
        fetchJson<
          Array<{ id: string; name: string; score: number; createdAt: number }>
        >(`/api/coinflip/scores?limit=${limit}`, { signal }),
    },
  );
}

export function useSubmitCoinflipScore() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<{ id: string; name: string; score: number; createdAt: number }>(
        "/api/coinflip/score",
        { method: "POST", body: args, signal },
      ),
    invalidate: [
      dataQueryKeys.list("coinflip-leaderboard", 10),
      dataQueryKeys.list("coinflip-scores", 200),
    ],
  });
}

export function useWheelStats() {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.query("wheel-stats"),
      queryFn: (_args, signal) =>
        fetchJson<WheelStats>("/api/wheel/stats", { signal }),
    },
  );
}

export function useLogWheelSpin() {
  return useDataMutation({
    mutationFn: (args, signal) =>
      fetchJson<null>("/api/wheel/spin", {
        method: "POST",
        body: args,
        signal,
      }),
    invalidate: [dataQueryKeys.query("wheel-stats")],
  });
}
