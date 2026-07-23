"use client";

import { useAuth } from "@clerk/nextjs";
import {
  Ban,
  Download,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type ModerationUpload = {
  id: string;
  slug: string;
  originalName: string;
  originalSize: number;
  state: string;
  rawIp: string;
  ipHash: string;
  publicExpiresAt: number;
  retainedUntil: number;
  createdAt: number;
  url: string;
  originalDownloadUrl: string;
  ownerTokenIdentifier: string | null;
  failureMessage: string | null;
};

function formatBytes(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return mib >= 1024
    ? `${(mib / 1024).toFixed(1)} GiB`
    : `${mib.toFixed(1)} MiB`;
}

export function QuickShareModerationClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [uploads, setUploads] = useState<ModerationUpload[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Sign in is required");
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      if (init.body) headers.set("content-type", "application/json");
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const error = new Error(
          body?.error ?? `Request failed (${response.status})`,
        );
        Object.assign(error, { status: response.status });
        throw error;
      }
      return (await response.json()) as T;
    },
    [getToken],
  );

  const load = useCallback(
    async (search = "") => {
      setLoading(true);
      try {
        const items = await request<ModerationUpload[]>(
          `/i/api/admin/uploads${search ? `?q=${encodeURIComponent(search)}` : ""}`,
        );
        setUploads(items);
        setForbidden(false);
      } catch (error) {
        if ((error as { status?: number }).status === 403) setForbidden(true);
        else
          toast.error(
            error instanceof Error ? error.message : "Could not load shares",
          );
      } finally {
        setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    void load();
  }, [isLoaded, isSignedIn, load]);

  async function search(event: FormEvent) {
    event.preventDefault();
    await load(query.trim());
  }

  async function action(
    path: string,
    body: Record<string, unknown>,
    message: string,
  ) {
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      toast.success(message);
      await load(query.trim());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function downloadOriginal(upload: ModerationUpload) {
    try {
      const { url } = await request<{ url: string }>(
        upload.originalDownloadUrl,
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = upload.originalName;
      anchor.rel = "noreferrer";
      anchor.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    }
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-5 text-2xl font-semibold">
          Moderation access required
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is limited to the configured Quick Share moderators.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Quick Share moderation
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Recent retained originals, network history, and abuse controls.
          </p>
        </div>
        <form onSubmit={search} className="flex w-full max-w-md gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search by short ID or IP address</span>
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Short ID or IP address"
              className="min-h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {uploads.length} retained share
          {uploads.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          aria-label="Refresh shares"
          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
          onClick={() => void load(query.trim())}
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-border p-5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading retained
          shares…
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Share</th>
                <th className="px-4 py-3 font-medium">IP address</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {uploads.map((upload) => (
                <tr key={upload.id} className="align-top">
                  <td className="max-w-xs px-4 py-4">
                    <a
                      href={upload.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {upload.slug}
                    </a>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {upload.originalName} · {formatBytes(upload.originalSize)}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {upload.rawIp}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-md border border-border px-2 py-1 text-xs">
                      {upload.state}
                    </span>
                    {upload.failureMessage ? (
                      <p className="mt-2 max-w-xs text-xs text-red-300">
                        {upload.failureMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                    {new Date(upload.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium"
                        onClick={() => void downloadOriginal(upload)}
                      >
                        <Download className="size-3.5" /> Original
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-2.5 py-2 text-xs font-medium text-red-200"
                        onClick={() =>
                          void action(
                            "/i/api/admin/bans",
                            { ip: upload.rawIp, reason: "Abusive media" },
                            "IP banned and active links revoked",
                          )
                        }
                      >
                        <Ban className="size-3.5" /> Ban IP
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium"
                        onClick={() =>
                          void action(
                            "/i/api/admin/bans/remove",
                            { ip: upload.rawIp },
                            "IP ban removed",
                          )
                        }
                      >
                        <Undo2 className="size-3.5" /> Unban
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-2 text-xs font-semibold text-white"
                        onClick={() =>
                          void action(
                            `/i/api/admin/uploads/${upload.id}/remove`,
                            {},
                            "Share removed",
                          )
                        }
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
