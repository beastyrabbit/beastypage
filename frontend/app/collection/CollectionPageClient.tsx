"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CollectionEntry } from "@/convex/collection";
import ProgressiveImage from "@/components/common/ProgressiveImage";
import { CONVEX_HTTP_URL } from "@/lib/convexClient";
import ExternalLinkIcon from "@/components/ui/external-link-icon";
import MagnifierIcon from "@/components/ui/magnifier-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import XIcon from "@/components/ui/x-icon";

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
          <SparklesIcon size={24} className="animate-spin" />
          <p>Loading gallery…</p>
        </div>
      </main>
    );
  }

  const safeEntries = entries ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="glass-card relative overflow-hidden px-8 py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-purple-500/10" aria-hidden />
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
        <div className="relative flex flex-col gap-4">
          <div className="section-eyebrow">Collection</div>
          <h1 className="text-4xl font-bold sm:text-5xl md:text-6xl">
            Community <span className="text-gradient-collection animate-shimmer bg-[length:200%_auto]">Art Collection</span>
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground/90 leading-relaxed">
            Explore the creative works and fan art from the BeastyRabbit community.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs mt-2">
            <span className="rounded-full bg-sky-500/10 px-3 py-1 font-bold text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]">
              {safeEntries.length} items
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-muted-foreground border border-white/5">
              {filteredEntries.length} showing
            </span>
          </div>
        </div>
      </header>

      <section className="glass-card grid gap-4 p-6 sticky top-4 z-30 backdrop-blur-xl border-white/20 shadow-2xl">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 transition-all focus-within:border-sky-500/50 focus-within:bg-black/60 focus-within:shadow-[0_0_20px_rgba(14,165,233,0.1)]">
          <MagnifierIcon size={20} className="text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder="Search by artist, animal, or link..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {filteredEntries.length === 0 ? (
        <div className="glass-card border border-dashed border-white/10 p-12 text-center text-muted-foreground">
          No artwork found for this combination. Try another search or animal.
        </div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map((entry, index) => {
            const preview = absoluteUrl(entry.preview_img) ?? absoluteUrl(entry.full_img);
            const blur = absoluteUrl(entry.blur_img) ?? preview;
            const full = absoluteUrl(entry.full_img);
            return (
              <article
                key={entry.id}
                className="glass-card group flex cursor-pointer flex-col overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:border-sky-500/30 animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => setActiveEntry(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveEntry(entry);
                  }
                }}
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <ProgressiveImage
                    lowSrc={blur}
                    highSrc={preview}
                    alt={entry.animal ?? "Artwork"}
                    imgStyle={{ objectPosition: `${entry.focusX}% ${entry.focusY}%` }}
                    className="transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-md border border-white/10">
                    {entry.animal ?? "Unknown"}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="text-lg font-bold capitalize text-foreground group-hover:text-sky-400 transition-colors">{entry.artist_name}</h3>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {entry.link && (
                      <Link
                        href={normalizeLink(entry.link)}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-white/10 hover:text-white hover:border-white/20"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Visit artist <ExternalLinkIcon size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <footer className="rounded-2xl border border-white/5 bg-white/5 p-6 text-xs text-muted-foreground text-center">
        Committing the export archive keeps deployments deterministic: bring up a fresh Convex instance, run the seed mutation, and these assets are instantly ready for LAN or production environments.
      </footer>

      {activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-10 backdrop-blur-md animate-in fade-in duration-300"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActiveEntry(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setActiveEntry(null);
            }
            if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
              event.preventDefault();
              setActiveEntry(null);
            }
          }}
        >
          <div className="glass-card relative w-full max-w-5xl overflow-hidden shadow-2xl border-white/20 animate-in zoom-in-95 duration-300">
            <button
              type="button"
              className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-white shadow-lg transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white backdrop-blur-md border border-white/10"
              onClick={() => setActiveEntry(null)}
              aria-label="Close"
            >
              <XIcon size={20} />
            </button>
            <div className="grid gap-6 p-6 md:grid-cols-[1.4fr,1fr]">
              <ProgressiveImage
                lowSrc={absoluteUrl(activeEntry.blur_img) ?? absoluteUrl(activeEntry.preview_img) ?? absoluteUrl(activeEntry.full_img)}
                highSrc={absoluteUrl(activeEntry.full_img) ?? absoluteUrl(activeEntry.preview_img)}
                alt={activeEntry.animal ?? "Artwork"}
                className="w-full overflow-hidden rounded-2xl bg-muted shadow-lg"
                imgStyle={{ objectPosition: `${activeEntry.focusX}% ${activeEntry.focusY}%` }}
              />
              <div className="flex flex-col gap-6 py-4">
                <div>
                  <h2 className="text-3xl font-bold capitalize text-gradient-collection inline-block">{activeEntry.artist_name}</h2>
                </div>
                <dl className="grid gap-3 text-sm">
                  <InfoRow label="Animal" value={activeEntry.animal ?? "Unknown"} />
                  {activeEntry.link && (
                    <InfoRow label="Source" value={normalizeLink(activeEntry.link)} isLink />
                  )}
                </dl>
                <div className="mt-auto flex flex-wrap gap-3 text-xs">
                  {absoluteUrl(activeEntry.full_img) && (
                    <a
                      href={absoluteUrl(activeEntry.full_img)!}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5"
                    >
                      Open full image <ExternalLinkIcon size={12} />
                    </a>
                  )}
                  {activeEntry.link && (
                    <Link
                      href={normalizeLink(activeEntry.link)}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 font-bold text-foreground transition-all hover:bg-white/10 hover:text-white hover:-translate-y-0.5"
                    >
                      Visit artist <ExternalLinkIcon size={12} />
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
