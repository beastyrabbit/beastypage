"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { fetchJson } from "@/lib/api";
import { dataQueryKeys, useDataMutation, useDataQuery } from "@/lib/data";

type Matchup = FunctionReturnType<typeof api.perfectCats.requestMatchup>;

export function usePerfectCatRegister() {
  return useDataMutation(api.perfectCats.registerCats, {
    mutationFn: (args, signal) =>
      fetchJson<unknown>("/api/perfect-cats/register", {
        method: "POST",
        body: args,
        signal,
      }),
  });
}

export function usePerfectCatMatchup() {
  return useDataMutation(api.perfectCats.requestMatchup, {
    mutationFn: (value, signal) =>
      fetchJson<Matchup>("/api/perfect-cats/matchup", {
        method: "POST",
        body: value,
        signal,
      }),
  });
}

export function usePerfectCatVote() {
  return useDataMutation(api.perfectCats.submitVote, {
    mutationFn: (args, signal) =>
      fetchJson<FunctionReturnType<typeof api.perfectCats.submitVote>>(
        "/api/perfect-cats/vote",
        { method: "POST", body: args, signal },
      ),
  });
}

export function usePerfectCatLeaderboard(limit = 10) {
  return useDataQuery(
    api.perfectCats.leaderboard,
    { limit },
    {
      queryKey: dataQueryKeys.list("perfect-cats-leaderboard", limit),
      queryFn: (_args, signal) =>
        fetchJson<Matchup["cats"]>(
          `/api/perfect-cats/leaderboard?limit=${limit}`,
          { signal },
        ),
    },
  );
}

export function useCoinflipLeaderboard(limit = 10) {
  return useDataQuery(
    api.coinflipper.leaderboard,
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
    api.coinflipper.listScores,
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
  return useDataMutation(api.coinflipper.submitScore, {
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
    api.wheel.stats,
    {},
    {
      queryKey: dataQueryKeys.query("wheel-stats"),
      queryFn: (_args, signal) =>
        fetchJson<FunctionReturnType<typeof api.wheel.stats>>(
          "/api/wheel/stats",
          { signal },
        ),
    },
  );
}

export function useLogWheelSpin() {
  return useDataMutation(api.wheel.logSpin, {
    mutationFn: (args, signal) =>
      fetchJson<null>("/api/wheel/spin", {
        method: "POST",
        body: args,
        signal,
      }),
    invalidate: [dataQueryKeys.query("wheel-stats")],
  });
}
