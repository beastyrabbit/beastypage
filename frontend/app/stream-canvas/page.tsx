"use client";

import { useConvexAuth } from "convex/react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { ArrowRight, Crown, Loader2, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/common/PageHero";
import { cn } from "@/lib/utils";
import { createRoom, getAccessibleRooms } from "@/lib/stream-canvas/api";
import type { AccessibleRoom } from "@/lib/stream-canvas/types";

export default function StreamCanvasPage() {
  const clerk = useClerk();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { getToken } = useAuth();
  const [rooms, setRooms] = useState<AccessibleRoom[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load accessible rooms on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    getAccessibleRooms(getToken)
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getToken]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createRoom(getToken);
      const updated = await getAccessibleRooms(getToken);
      setRooms(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
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
          description="Sign in to create or join a collaborative stream canvas."
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

  const hasOwnRoom = rooms?.some((r) => r.isOwner) ?? false;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <PageHero
        eyebrow="Stream Canvas"
        title="Your Canvases"
        description="Join a collaborative canvas or create your own."
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {rooms === null ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No canvases yet. Create one to get started.
            </p>
          )}

          {rooms.map((room) => (
            <div
              key={room.id}
              className="group rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur transition hover:border-border/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {room.isOwner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                      <Crown className="size-3" />
                      Owner
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {room.twitchChannel
                        ? `${room.twitchChannel}'s Canvas`
                        : `Canvas ${room.id.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {room.allowedUsers.length} collaborator
                      {room.allowedUsers.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {room.isOwner && (
                    <Link
                      href="/stream-canvas/settings"
                      className="rounded-lg border border-border/50 p-2 text-muted-foreground transition hover:text-foreground"
                      title="Settings"
                    >
                      <Settings className="size-4" />
                    </Link>
                  )}
                  <Link
                    href={`/stream-canvas/${room.id}`}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2",
                      "text-sm font-semibold text-background transition hover:opacity-90",
                    )}
                  >
                    Join
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {!hasOwnRoom && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-2xl",
                "border border-dashed border-border/50 bg-background/50 p-5",
                "text-sm font-medium text-muted-foreground transition",
                "hover:border-border hover:text-foreground",
                "disabled:opacity-50",
              )}
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create Your Canvas
            </button>
          )}
        </div>
      )}
    </main>
  );
}
