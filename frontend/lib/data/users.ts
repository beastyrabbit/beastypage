"use client";

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
    {},
    {
      queryKey: dataQueryKeys.query("users.viewer"),
      queryFn: (_, signal) =>
        get<any>("/api/users/viewer", signal, { nullable: true }),
    },
  );
}

export function useEnsureUser() {
  return useDataMutation({
    mutationFn: () => post<any>("/api/users/ensure"),
    // The viewer may have cached `null` before the user row existed.
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useUpdateUserProfile() {
  return useDataMutation({
    mutationFn: (args) => patch<any>("/api/users/profile", args),
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useResetSavedVariants() {
  return useDataMutation({
    mutationFn: () => post<any>("/api/users/reset-variants"),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
}

export function useRegenerateUserApiKey() {
  return useDataMutation({
    mutationFn: () => post<any>("/api/users/api-key"),
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useUserVariants(toolKey?: string, enabled = true) {
  const args = toolKey ? { toolKey } : {};
  return useDataQuery((toolKey ? args : "skip") as never, {
    queryKey: dataQueryKeys.list("userVariants", args),
    queryFn: (_, signal) => {
      const toolParam = toolKey
        ? `?toolKey=${encodeURIComponent(toolKey)}`
        : "";
      return get<any>(`/api/user-variants${toolParam}`, signal);
    },
    enabled,
  });
}

export function useAllUserVariants(enabled = true) {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.query("userVariants.listAll"),
      queryFn: (_, signal) => get<any>("/api/user-variants", signal),
      enabled,
    },
  );
}

function variantMutation(operation: string) {
  return (args: Record<string, unknown>) =>
    post<unknown>("/api/user-variants", { operation, ...args });
}

export const useUpsertUserVariant = () =>
  useDataMutation({
    mutationFn: (args) => variantMutation("upsert")(args) as Promise<any>,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRemoveUserVariant = () =>
  useDataMutation({
    mutationFn: (args) => variantMutation("remove")(args) as Promise<any>,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useImportUserVariants = () =>
  useDataMutation({
    mutationFn: (args) => variantMutation("importBatch")(args) as Promise<any>,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRenameUserVariant = () =>
  useDataMutation({
    mutationFn: (args) => variantMutation("rename")(args) as Promise<any>,
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useSetActiveUserVariant = () =>
  useDataMutation({
    mutationFn: (args) => variantMutation("setActive")(args) as Promise<any>,
    invalidate: [dataQueryKeys.query("userVariants.listAll")],
  });

export function useDiscordChallenge() {
  return useDataMutation({
    mutationFn: () => post<any>("/api/discord/challenge", {}),
  });
}

export function useRedeemDiscordChallenge() {
  return useDataMutation({
    mutationFn: (args) => post<any>("/api/discord/challenge", args),
  });
}
