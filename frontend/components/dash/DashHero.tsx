"use client";

import { HeroSocialButtons } from "@/components/common/SocialLinks";
import { Pencil, Check } from "lucide-react";

interface DashHeroProps {
  version: string;
  hasNewVersion: boolean;
  onOpenReleaseNotes: () => void;
  editing: boolean;
  onToggleEditing: () => void;
}

export function DashHero({ version, hasNewVersion, onOpenReleaseNotes, editing, onToggleEditing }: DashHeroProps) {
  return (
    <section className="theme-hero theme-dash rounded-3xl border border-emerald-500/20 p-6 sm:p-8">
      <p className="section-eyebrow text-emerald-200/90">Dashboard</p>

      <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
        Hey, I&apos;m <strong className="text-gradient-dash">Beasty.</strong>
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <HeroSocialButtons />

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
          onClick={onToggleEditing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground"
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
    </section>
  );
}
