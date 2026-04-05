"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { Copy, Eye, EyeOff, Loader2, RefreshCw, Save, Tv } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHero } from "@/components/common/PageHero";
import { UserMultiSelect } from "@/components/stream-canvas/UserMultiSelect";
import {
  createRoom,
  getObsSecret,
  regenerateSecret,
  updateRoom,
} from "@/lib/stream-canvas/api";
import type { CanvasRoom } from "@/lib/stream-canvas/types";
import { cn } from "@/lib/utils";

export default function StreamCanvasSettingsPage() {
  const clerk = useClerk();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { getToken } = useAuth();

  const [room, setRoom] = useState<CanvasRoom | null>(null);
  const [obsSecret, setObsSecret] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [twitchChannel, setTwitchChannel] = useState("");
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Load or create room
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    createRoom(getToken)
      .then((r) => {
        if (cancelled) return;
        setRoom(r);
        setTwitchChannel(r.twitchChannel ?? "");
        setAllowedUsers(r.allowedUsers);

        // Load OBS secret
        getObsSecret(r.id, getToken)
          .then((data) => {
            if (!cancelled) setObsSecret(data.obsSecret);
          })
          .catch((err) => {
            if (!cancelled) toast.error("Failed to load OBS secret: " + (err instanceof Error ? err.message : String(err)));
          });
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load room settings");
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getToken]);

  const handleSave = useCallback(async () => {
    if (!room) return;
    setSaving(true);
    try {
      const updated = await updateRoom(
        room.id,
        { twitchChannel: twitchChannel || undefined, allowedUsers },
        getToken,
      );
      setRoom(updated);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [room, twitchChannel, allowedUsers, getToken]);

  const handleRegenerate = useCallback(async () => {
    if (!room) return;
    if (
      !window.confirm(
        "Regenerate OBS secret? The current OBS browser source URL will stop working.",
      )
    )
      return;

    try {
      await regenerateSecret(room.id, getToken);
      const data = await getObsSecret(room.id, getToken);
      setObsSecret(data.obsSecret);
      toast.success("OBS secret regenerated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate");
    }
  }, [room, getToken]);

  const obsUrl =
    obsSecret && typeof window !== "undefined"
      ? `${window.location.origin}/stream-canvas/obs?secret=${obsSecret}`
      : null;

  if (authLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <PageHero
          eyebrow="Stream Canvas"
          title="Sign in to continue"
          description="You need to be signed in to configure your Stream Canvas."
        />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => clerk.openSignIn()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50",
              "px-5 py-2.5 text-sm font-semibold text-muted-foreground",
              "transition hover:bg-foreground hover:text-background",
            )}
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <PageHero
        eyebrow="Stream Canvas"
        title="Canvas Settings"
        description="Configure your Twitch embed, allowed users, and OBS browser source URL."
      />

      {!room ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Twitch Channel */}
          <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
            <label className="mb-2 block text-sm font-medium text-foreground">
              <Tv className="mb-0.5 mr-1 inline size-4" />
              Twitch Channel
            </label>
            <input
              type="text"
              value={twitchChannel}
              onChange={(e) => setTwitchChannel(e.target.value)}
              placeholder="e.g. BeastyRabbit"
              className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The Twitch stream embedded in the canvas center.
            </p>
          </section>

          {/* Allowed Users */}
          <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Allowed Users
            </label>
            <UserMultiSelect value={allowedUsers} onChange={setAllowedUsers} />
            <p className="mt-1 text-xs text-muted-foreground">
              Users who can edit your canvas. Search by username — stored by
              user ID so username changes don't break access.
            </p>
          </section>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5",
              "text-sm font-semibold text-background transition hover:opacity-90",
              "disabled:opacity-50",
            )}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Settings
          </button>

          {/* OBS Browser Source URL */}
          <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              OBS Browser Source URL
            </h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border/50 bg-background px-3 py-2 text-xs">
                {obsUrl === null
                  ? "Loading…"
                  : secretRevealed
                    ? obsUrl
                    : `${window.location.origin}/stream-canvas/obs?secret=${"•".repeat(8)}`}
              </code>
              <button
                type="button"
                onClick={() => setSecretRevealed(!secretRevealed)}
                className="rounded-lg border border-border/50 p-2 text-muted-foreground hover:text-foreground"
                title={secretRevealed ? "Hide" : "Reveal"}
              >
                {secretRevealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!obsUrl) return;
                  try {
                    await navigator.clipboard.writeText(obsUrl);
                    toast.success("Copied to clipboard");
                  } catch {
                    toast.error("Failed to copy — please select and copy manually");
                  }
                }}
                className="rounded-lg border border-border/50 p-2 text-muted-foreground hover:text-foreground"
                title="Copy URL"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Add this as a Browser Source in OBS (1920×1080). The secret in the
              URL is exchanged for a short-lived token on each page load.
            </p>
            <button
              type="button"
              onClick={handleRegenerate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
            >
              <RefreshCw className="size-3" />
              Regenerate Secret
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
