"use client";

import { fetchJson } from "@/lib/api";
import type {
  issueChallenge,
  redeemChallenge,
} from "@/server/services/discord";
import type {
  getOrCreateUser,
  regenerateApiKey,
  resetSavedVariants,
  updateProfile,
  viewer,
} from "@/server/services/users";
import type {
  importBatch,
  list,
  remove,
  rename,
  setActive,
  upsert,
} from "@/server/services/userVariants";

type VariantList = Awaited<ReturnType<typeof list>>;
type VariantUpsertArgs = Parameters<typeof upsert>[2];
type VariantImportArgs = {
  toolKey: string;
  variants: Parameters<typeof importBatch>[3];
};
type VariantRemoveArgs = {
  toolKey: Parameters<typeof remove>[2];
  variantId: Parameters<typeof remove>[3];
};
type VariantRenameArgs = {
  toolKey: Parameters<typeof rename>[2];
  variantId: Parameters<typeof rename>[3];
  name: Parameters<typeof rename>[4];
};
type VariantSetActiveArgs = {
  toolKey: Parameters<typeof setActive>[2];
  variantId?: NonNullable<Parameters<typeof setActive>[3]>;
};

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
        get<Awaited<ReturnType<typeof viewer>>>("/api/users/viewer", signal, {
          nullable: true,
        }),
    },
  );
}

export function useEnsureUser() {
  return useDataMutation({
    mutationFn: () =>
      post<Awaited<ReturnType<typeof getOrCreateUser>>>("/api/users/ensure"),
    // The viewer may have cached `null` before the user row existed.
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useUpdateUserProfile() {
  return useDataMutation({
    mutationFn: (args) =>
      patch<Awaited<ReturnType<typeof updateProfile>>>(
        "/api/users/profile",
        args,
      ),
    invalidate: [dataQueryKeys.query("users.viewer")],
  });
}

export function useResetSavedVariants() {
  return useDataMutation({
    mutationFn: () =>
      post<Awaited<ReturnType<typeof resetSavedVariants>>>(
        "/api/users/reset-variants",
      ),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
}

export function useRegenerateUserApiKey() {
  return useDataMutation({
    mutationFn: () =>
      post<Awaited<ReturnType<typeof regenerateApiKey>>>("/api/users/api-key"),
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
      return get<VariantList>(`/api/user-variants${toolParam}`, signal);
    },
    enabled,
  });
}

export function useAllUserVariants(enabled = true) {
  return useDataQuery(
    {},
    {
      queryKey: dataQueryKeys.query("userVariants.listAll"),
      queryFn: (_, signal) => get<VariantList>("/api/user-variants", signal),
      enabled,
    },
  );
}

function variantMutation<TResult>(operation: string) {
  return (args: Record<string, unknown>) =>
    post<TResult>("/api/user-variants", { operation, ...args });
}

export const useUpsertUserVariant = () =>
  useDataMutation<VariantUpsertArgs, Awaited<ReturnType<typeof upsert>>>({
    mutationFn: (args) =>
      variantMutation<Awaited<ReturnType<typeof upsert>>>("upsert")(args),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRemoveUserVariant = () =>
  useDataMutation<VariantRemoveArgs, Awaited<ReturnType<typeof remove>>>({
    mutationFn: (args) =>
      variantMutation<Awaited<ReturnType<typeof remove>>>("remove")(args),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useImportUserVariants = () =>
  useDataMutation<VariantImportArgs, Awaited<ReturnType<typeof importBatch>>>({
    mutationFn: (args) =>
      variantMutation<Awaited<ReturnType<typeof importBatch>>>("importBatch")(
        args,
      ),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useRenameUserVariant = () =>
  useDataMutation<VariantRenameArgs, Awaited<ReturnType<typeof rename>>>({
    mutationFn: (args) =>
      variantMutation<Awaited<ReturnType<typeof rename>>>("rename")(args),
    invalidate: [
      dataQueryKeys.query("userVariants.listAll"),
      dataQueryKeys.list("userVariants"),
    ],
  });
export const useSetActiveUserVariant = () =>
  useDataMutation<VariantSetActiveArgs, Awaited<ReturnType<typeof setActive>>>({
    mutationFn: (args) =>
      variantMutation<Awaited<ReturnType<typeof setActive>>>("setActive")(args),
    invalidate: [dataQueryKeys.query("userVariants.listAll")],
  });

export function useDiscordChallenge() {
  return useDataMutation({
    mutationFn: () =>
      post<Awaited<ReturnType<typeof issueChallenge>>>(
        "/api/discord/challenge",
        {},
      ),
  });
}

export function useRedeemDiscordChallenge() {
  return useDataMutation({
    mutationFn: (args) =>
      post<Awaited<ReturnType<typeof redeemChallenge>>>(
        "/api/discord/challenge",
        args,
      ),
  });
}
