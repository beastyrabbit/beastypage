"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CollectionEntry } from "@/convex/collection";
import ProgressiveImage from "@/components/common/ProgressiveImage";
import { CONVEX_HTTP_URL } from "@/lib/convexClient";
import { ExternalLink, Search, Sparkles, X } from "lucide-react";

export default function CollectionPage() {
  const entries = useQuery(api.collection.list, {});
  const [search, setSearch] = useState("");
  const [activeEntry, setActiveEntry] = useState<CollectionEntry | null>(null);

  useEffect(() => {
    if (!activeEntry) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveEntry(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEntry]);

  const isLoading = !entries;

  const filteredEntries = useMemo(() => {
    if (!entries) return [] as CollectionEntry[];
    const query = search.trim().toLowerCase();
    return entries
      .filter((entry) => {
        if (!query) return true;
        const haystack = [
          entry.artist_name,
          entry.animal,
          entry.link ?? "",
          formatDate(entry.updated ?? entry.created)
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }, [entries, search]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-10">
        <div className="glass-card flex flex-col items-center gap-3 px-6 py-8 text-muted-foreground">
          <Sparkles className="size-6 animate-spin" />
          <p>Loading gallery…</p>
        </div>
      </main>
    );
  }

  const safeEntries = entries ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="glass-card relative overflow-hidden px-8 py-10">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/15 via-transparent to-purple-500/20" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div className="section-eyebrow">Collection</div>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            Community art, mood boards, and archival batik textures.
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            This gallery ships with the PocketBase export bundle. Each card preloads a blurred thumbnail so the grid appears instantly, then upgrades in-place as higher quality assets stream in.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
              {safeEntries.length} items
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
              {filteredEntries.length} showing
            </span>
          </div>
        </div>
      </header>

      <section className="glass-card grid gap-4 p-6">
        <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Search by artist, animal, or link"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {filteredEntries.length === 0 ? (
        <div className="glass-card border border-dashed border-border/60 p-12 text-center text-muted-foreground">
          No artwork found for this combination. Try another search or animal.
        </div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map((entry) => {
            const preview = absoluteUrl(entry.preview_img) ?? absoluteUrl(entry.full_img);
            const blur = absoluteUrl(entry.blur_img) ?? preview;
            const full = absoluteUrl(entry.full_img);
            return (
              <article
                key={entry.id}
                className="glass-card group flex cursor-pointer flex-col overflow-hidden transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl"
                onClick={() => setActiveEntry(entry)}
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <ProgressiveImage
                    lowSrc={blur}
                    highSrc={preview}
                    alt={entry.animal ?? "Artwork"}
                    imgStyle={{ objectPosition: `${entry.focusX}% ${entry.focusY}%` }}
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">
                    {entry.animal ?? "Unknown"}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="text-lg font-semibold capitalize">{entry.artist_name}</h3>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {entry.link && (
                      <Link
                        href={normalizeLink(entry.link)}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-foreground hover:text-background"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Visit artist <ExternalLink className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <footer className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground">
        Committing the export archive keeps deployments deterministic: bring up a fresh Convex instance, run the seed mutation, and these assets are instantly ready for LAN or production environments.
      </footer>

      {activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-sm"
          onClick={() => setActiveEntry(null)}
        >
          <div className="glass-card relative w-full max-w-5xl overflow-hidden">
            <button
              type="button"
              className="absolute right-4 top-4 z-20 rounded-full bg-black/70 p-2 text-white shadow-lg transition hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => setActiveEntry(null)}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div
              className="grid gap-6 p-6 md:grid-cols-[1.4fr,1fr]"
              onClick={(event) => event.stopPropagation()}
            >
              <ProgressiveImage
                lowSrc={absoluteUrl(activeEntry.blur_img) ?? absoluteUrl(activeEntry.preview_img) ?? absoluteUrl(activeEntry.full_img)}
                highSrc={absoluteUrl(activeEntry.full_img) ?? absoluteUrl(activeEntry.preview_img)}
                alt={activeEntry.animal ?? "Artwork"}
                className="w-full overflow-hidden rounded-2xl bg-muted"
                imgStyle={{ objectPosition: `${activeEntry.focusX}% ${activeEntry.focusY}%` }}
              />
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold capitalize">{activeEntry.artist_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {activeEntry.animal ?? "Unknown subject"}
                  </p>
                </div>
                <dl className="grid gap-2 text-xs">
                  <InfoRow label="Updated" value={formatDate(activeEntry.updated ?? activeEntry.created)} />
                  <InfoRow
                    label="Has full quality"
                    value={absoluteUrl(activeEntry.full_img) ? "Yes" : "Preview only"}
                  />
                  {activeEntry.link && (
                    <InfoRow label="Source" value={normalizeLink(activeEntry.link)} isLink />
                  )}
                </dl>
                <div className="mt-auto flex flex-wrap gap-3 text-xs">
                  {absoluteUrl(activeEntry.full_img) && (
                    <a
                      href={absoluteUrl(activeEntry.full_img)!}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      Open full image <ExternalLink className="size-3" />
                    </a>
                  )}
                  {activeEntry.link && (
                    <Link
                      href={normalizeLink(activeEntry.link)}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 font-medium text-foreground transition hover:bg-foreground hover:text-background"
                    >
                      Visit artist <ExternalLink className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "—";
  }
}

function normalizeLink(link: string): string {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  return `https://${link}`;
}

function InfoRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  const content = isLink ? (
    <Link href={normalizeLink(value)} target="_blank" className="text-primary underline">
      {value}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{value}</span>
  );

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      {content}
    </div>
  );
}

function absoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const preferred = new URL(CONVEX_HTTP_URL);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        parsed.protocol = preferred.protocol;
        parsed.host = preferred.host;
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
  const base = CONVEX_HTTP_URL.replace(/\/$/, "");
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}
