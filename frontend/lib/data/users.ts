"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { fetchJson } from "@/lib/api";
import { useDataMutation, useDataQuery } from "./hooks";
import { dataQueryKeys } from "./keys";

const get = <T>(
  url: string,
  signal?: AbortSignal,
  options?: { nullable?: boolean },
) => fetchJson<T>(url, { signal, ...options });
const post = <T>(url: string, body?: unknown) =>
  fetchJson<T>(url, { method: "POST", body });
const patch = <T>(url: string, body?: unknown) =>
  fetchJson<T>(url, { method: "PATCH", body });

export function useUserViewer() {
  return useDataQuery(
    api.users.viewer,
    {},
    {
      queryKey: dataQueryKeys.query("users.viewer"),
      queryFn: (_, signal) =>
        get<FunctionReturnType<typeof api.users.viewer>>(
          "/api/users/viewer",
          signal,
          { nullable: true },
        ),
    },
  );
}

export function useEnsureUser() {
  return useDataMutation(api.users.getOrCreateUser, {
    mutationFn: () =>
      post<FunctionReturnType<typeof api.users.getOrCreateUser>>(
        "/api/users/ensure",
      ),
  });
}

export function useUpdateUserProfile() {
  return useDataMutation(api.users.updateProfile, {
    mutationFn: (args) =>
      patch<FunctionReturnType<typeof api.users.updateProfile>>(
        "/api/users/profile",
        args,
      ),
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useResetSavedVariants() {
  return useDataMutation(api.users.resetSavedVariants, {
    mutationFn: () =>
      post<FunctionReturnType<typeof api.users.resetSavedVariants>>(
        "/api/users/reset-variants",
      ),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
}

export function useRegenerateUserApiKey() {
  return useDataMutation(api.users.regenerateApiKey, {
    mutationFn: () =>
      post<FunctionReturnType<typeof api.users.regenerateApiKey>>(
        "/api/users/api-key",
      ),
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useUserVariants(toolKey?: string, enabled = true) {
  const args = toolKey ? { toolKey } : {};
  return useDataQuery(
    api.userVariants.list,
    (toolKey ? args : "skip") as never,
    {
      queryKey: dataQueryKeys.list("userVariants", args),
      queryFn: (_, signal) =>
        get<FunctionReturnType<typeof api.userVariants.list>>(
          `/api/user-variants${toolKey ? `?toolKey=${encodeURIComponent(toolKey)}` : ""}`,
          signal,
        ),
      enabled,
    },
  );
}

export function useAllUserVariants(enabled = true) {
  return useDataQuery(
    api.userVariants.listAll,
    {},
    {
      queryKey: dataQueryKeys.query("userVariants.listAll"),
      queryFn: (_, signal) =>
        get<FunctionReturnType<typeof api.userVariants.listAll>>(
          "/api/user-variants",
          signal,
        ),
      enabled,
    },
  );
}

function variantMutation(operation: string) {
  return (args: Record<string, unknown>) =>
    post<unknown>("/api/user-variants", { operation, ...args });
}

export const useUpsertUserVariant = () =>
  useDataMutation(api.userVariants.upsert, {
    mutationFn: (args) =>
      variantMutation("upsert")(args) as Promise<
        FunctionReturnType<typeof api.userVariants.upsert>
      >,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRemoveUserVariant = () =>
  useDataMutation(api.userVariants.remove, {
    mutationFn: (args) =>
      variantMutation("remove")(args) as Promise<
        FunctionReturnType<typeof api.userVariants.remove>
      >,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useImportUserVariants = () =>
  useDataMutation(api.userVariants.importBatch, {
    mutationFn: (args) =>
      variantMutation("importBatch")(args) as Promise<
        FunctionReturnType<typeof api.userVariants.importBatch>
      >,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRenameUserVariant = () =>
  useDataMutation(api.userVariants.rename, {
    mutationFn: (args) =>
      variantMutation("rename")(args) as Promise<
        FunctionReturnType<typeof api.userVariants.rename>
      >,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useSetActiveUserVariant = () =>
  useDataMutation(api.userVariants.setActive, {
    mutationFn: (args) =>
      variantMutation("setActive")(args) as Promise<
        FunctionReturnType<typeof api.userVariants.setActive>
      >,
    invalidate: [dataQueryKeys.query("userVariants.listAll")],
  });

export function useDiscordChallenge() {
  return useDataMutation(api.discord.issueChallenge, {
    mutationFn: () =>
      post<FunctionReturnType<typeof api.discord.issueChallenge>>(
        "/api/discord/challenge",
        {},
      ),
  });
}

export function useRedeemDiscordChallenge() {
  return useDataMutation(api.discord.redeemChallenge, {
    mutationFn: (args) =>
      post<FunctionReturnType<typeof api.discord.redeemChallenge>>(
        "/api/discord/challenge",
        args,
      ),
  });
}
