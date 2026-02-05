"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { fetchReleases } from "@/lib/dash/releases";
import type { ReleaseNote } from "@/lib/dash/types";
import { MarkdownBody } from "./MarkdownBody";

interface ReleaseNotesModalProps {
  open: boolean;
  onClose: (latestTag: string | null) => void;
}

export function ReleaseNotesModal({ open, onClose }: ReleaseNotesModalProps) {
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  const latestTag = releases.length > 0 ? releases[0].tag : null;
  const handleClose = useCallback(() => onClose(latestTag), [onClose, latestTag]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetchReleases()
      .then((data) => {
        if (cancelled) return;
        setReleases(data);
        // Expand the latest release by default
        if (data.length > 0) {
          setExpandedTags(new Set([data[0].tag]));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ReleaseNotesModal] Failed to load releases", err);
        setError("Could not load release notes. Please try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative mx-4 w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-3xl border border-border/40 bg-background/95 p-6 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition"
        >
          <X className="size-4" />
        </button>

        <h2 className="mb-5 text-sm font-semibold text-foreground">Release Notes</h2>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && releases.length === 0 && (
          <p className="text-sm text-muted-foreground">No releases found.</p>
        )}

        {!loading && releases.map((release) => {
          const expanded = expandedTags.has(release.tag);
          let date = "";
          if (release.publishedAt) {
            const parsed = new Date(release.publishedAt);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            }
          }
          return (
            <div key={release.tag} className="mb-3 rounded-xl border border-border/30 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleTag(release.tag)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-foreground/5"
              >
                <span className="font-mono text-xs font-semibold text-emerald-400">{release.tag}</span>
                {release.name && release.name !== release.tag && (
                  <span className="text-xs text-foreground truncate">{release.name}</span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">{date}</span>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>

              {expanded && release.body && (
                <div className="border-t border-border/20 px-4 py-3">
                  <MarkdownBody content={release.body} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
