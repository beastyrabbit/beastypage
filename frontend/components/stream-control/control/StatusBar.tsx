"use client";

import { Copy, Eye, Radio, Square, Timer } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildBatchStagePlan,
  formatBatchNumber,
} from "@/lib/adoption/streamBatch";
import { formatDuration } from "@/lib/evolution/ceremonyEstimate";
import { cn } from "@/lib/utils";
import { OVERLAY_THEME_META } from "../obs/themes/themeMeta";
import { useStreamControl } from "./context";
import { describeBatchBeat, evolutionLedger } from "./helpers";
import { PaletteDots } from "./look/ThemeTile";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70";

/**
 * Where the live show is, for the on-air pill: "Stage 7/23 · WHITE PATCHES ·
 * awaiting" or "Roll · ACCESSORY · 1/2 · 1m 12s left". Ticks once a second
 * while a show is live; null otherwise.
 */
function useShowReadout(): string | null {
  const {
    showLive,
    currentBatchCommand,
    batchLiveState,
    currentEvolutionCommand,
    evolutionLiveState,
  } = useStreamControl();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showLive) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showLive]);
  const stages = useMemo(
    () =>
      currentBatchCommand
        ? buildBatchStagePlan(
            currentBatchCommand.config,
            currentBatchCommand.cats,
          )
        : [],
    [currentBatchCommand],
  );
  if (!showLive) return null;
  if (currentBatchCommand) {
    const cats = currentBatchCommand.cats;
    const readout = describeBatchBeat(
      batchLiveState,
      stages,
      null,
      (id) => formatBatchNumber(cats.findIndex((cat) => cat.id === id) + 1),
      now,
    );
    return readout
      ? `${readout.stage} · ${readout.trait} · ${readout.beat}`
      : null;
  }
  if (currentEvolutionCommand) {
    const ledger = evolutionLedger(
      currentEvolutionCommand,
      evolutionLiveState,
      now,
    );
    const eta = ledger.held
      ? "held"
      : `${formatDuration(ledger.etaMs / 1000)} left`;
    return `${ledger.stepLabel} · ${eta}`;
  }
  return null;
}

/**
 * Persistent bar above the tab panels. Left: the scene switcher (Lobby /
 * BRB / Test), Clear overlay, and what is on air. Right: the overlay theme
 * (jumps to the Look tab) and the OBS browser-source URL.
 */
export function StatusBar() {
  const {
    obsUrl,
    activeScene,
    onAirLabel,
    commandBusy,
    testMode,
    runLobbyScene,
    runBrbScene,
    runTestScene,
    runClearScene,
    overlayTheme,
    setActiveTab,
  } = useStreamControl();
  const themeMeta = OVERLAY_THEME_META[overlayTheme];
  const showReadout = useShowReadout();

  const scenes = [
    {
      id: "lobby",
      label: "Lobby",
      hint: "Show the lobby: settings card and wandering cats",
      icon: Eye,
      onClick: runLobbyScene,
    },
    {
      id: "brb",
      label: "BRB",
      hint: "Be right back: cats only",
      icon: Timer,
      onClick: runBrbScene,
    },
    {
      id: "test",
      label: "Test",
      hint: testMode
        ? "Test mode is on: turn off the debug border"
        : "Turn on test mode: debug border and crop guides",
      icon: Radio,
      onClick: runTestScene,
    },
  ] as const;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/80 p-3 backdrop-blur">
      {/* Scenes */}
      <div className="flex flex-wrap items-center gap-2">
        <fieldset
          aria-label="Overlay scene"
          className="m-0 inline-flex min-w-0 items-center gap-0.5 rounded-xl border border-border/40 bg-muted/20 p-1"
        >
          {scenes.map((scene) => {
            const pressed = activeScene === scene.id;
            return (
              <button
                type="button"
                key={scene.id}
                onClick={scene.onClick}
                aria-pressed={pressed}
                title={scene.hint}
                disabled={commandBusy}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  FOCUS_RING,
                  pressed
                    ? "text-amber-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {pressed ? (
                  <motion.span
                    layoutId="scene-pill"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg border border-amber-500/40 bg-amber-500/15"
                    transition={{
                      type: "spring",
                      bounce: 0.18,
                      duration: 0.36,
                    }}
                  />
                ) : null}
                <scene.icon className="relative size-3.5" aria-hidden="true" />
                <span className="relative">{scene.label}</span>
              </button>
            );
          })}
        </fieldset>

        <button
          type="button"
          onClick={runClearScene}
          disabled={commandBusy}
          title="Hide everything on the overlay"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border border-border/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors",
            "hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-300",
            "disabled:cursor-not-allowed disabled:opacity-60",
            FOCUS_RING,
          )}
        >
          <Square className="size-3.5" aria-hidden="true" />
          Clear overlay
        </button>

        <output
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-300",
            onAirLabel
              ? "border-red-500/30 bg-red-500/10 text-red-100"
              : "border-border/40 text-muted-foreground",
          )}
        >
          <span className="relative flex size-2" aria-hidden="true">
            {onAirLabel ? (
              <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-60 motion-safe:animate-ping" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                onAirLabel ? "bg-red-500" : "bg-muted-foreground/40",
              )}
            />
          </span>
          <span>
            On air:{" "}
            {onAirLabel ? (
              <span className="font-semibold">{onAirLabel}</span>
            ) : (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">nothing</span>
              </>
            )}
            {showReadout ? (
              <span className="font-mono tabular-nums text-red-100/80">
                {" · "}
                {showReadout}
              </span>
            ) : null}
          </span>
        </output>
      </div>

      {/* Look + OBS */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("look")}
          title="Change the overlay theme"
          aria-label={`Overlay theme: ${themeMeta.label}. Change theme`}
          className={cn(
            "group inline-flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2 text-xs transition-colors",
            "hover:border-amber-500/40 hover:bg-amber-500/5",
            FOCUS_RING,
          )}
        >
          <span className="text-muted-foreground">Theme</span>
          <motion.span
            key={overlayTheme}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2"
          >
            <PaletteDots theme={overlayTheme} />
            <span className="font-semibold text-foreground group-hover:text-amber-200">
              {themeMeta.label}
            </span>
          </motion.span>
        </button>

        {obsUrl && (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(obsUrl);
                  toast.success("OBS URL copied!");
                } catch {
                  toast.error("Failed to copy OBS URL");
                }
              })();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-2",
              "text-xs font-semibold text-muted-foreground transition-colors",
              "hover:bg-foreground hover:text-background",
              FOCUS_RING,
            )}
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copy OBS URL
          </button>
        )}
      </div>
    </section>
  );
}
