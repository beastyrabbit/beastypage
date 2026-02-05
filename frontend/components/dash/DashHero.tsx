"use client";

import Image from "next/image";
import Link from "next/link";
import { Pencil, Check, Github, ExternalLink, Loader2 } from "lucide-react";
import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";

interface DashHeroProps {
  version: string;
  hasNewVersion: boolean;
  onOpenReleaseNotes: () => void;
  editing: boolean;
  onToggleEditing: () => void;
  hasVariant: boolean;
  opening: boolean;
  onOpen: () => void;
}

const HERO_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-slate-950/70 px-4 py-2 text-xs font-bold text-emerald-100 transition-all hover:border-emerald-300/60 hover:text-white hover:bg-slate-900 hover:shadow-[0_0_15px_rgba(52,211,153,0.2)]";

export function DashHero({
  version,
  hasNewVersion,
  onOpenReleaseNotes,
  editing,
  onToggleEditing,
  hasVariant,
  opening,
  onOpen,
}: DashHeroProps) {
  return (
    <section className="relative rounded-3xl overflow-hidden">
      {/* Banner Background */}
      <div className="absolute inset-0">
        <Image
          src="/beasty-banner.png"
          alt=""
          fill
          className="object-cover opacity-40"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 px-8 py-12 text-balance">
        <p className="section-eyebrow text-emerald-200/90">Dashboard</p>
        <h1 className="mt-4 text-5xl font-bold leading-tight sm:text-6xl">
          Hey there, I&apos;m <span className="text-gradient-dash animate-shimmer bg-[length:200%_auto]">Beasty.</span>
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="https://github.com/beastyrabbit"
            target="_blank"
            rel="noopener noreferrer"
            className={HERO_BUTTON_CLASS}
          >
            <Github size={12} /> GitHub
          </Link>
          <DiscordInviteButton className={HERO_BUTTON_CLASS} />

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenReleaseNotes}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-slate-950/70 px-3 py-1.5 text-xs font-bold text-emerald-100 transition-all hover:border-emerald-300/60 hover:text-white hover:bg-slate-900"
            >
              {version}
              {hasNewVersion && (
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpen}
              disabled={!hasVariant || opening}
              title={hasVariant ? "Open shareable link" : "No variant"}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {opening ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
              Open
            </button>

            <button
              type="button"
              onClick={onToggleEditing}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground"
            >
              {editing ? (
                <>
                  <Check className="size-3" /> Done
                </>
              ) : (
                <>
                  <Pencil className="size-3" /> Edit
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
