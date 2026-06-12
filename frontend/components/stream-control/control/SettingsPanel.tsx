"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrbPresetSection } from "./BrbPresetSection";
import { useStreamControl } from "./context";
import { SliderControl } from "./controls";
import {
  formatMultiplier,
  LOBBY_MODE_DEFAULTS,
  type LobbyMode,
} from "./helpers";
import { useFollowGuard } from "./useFollowGuard";

const LOBBY_MODE_LABELS: Record<LobbyMode, string> = {
  "fruit-ninja": "Fruit Ninja",
  matrix: "Matrix",
  dvd: "DVD Bounce",
  parade: "Parade",
  orbit: "Orbit",
  bubbles: "Bubbles",
};

type ObsLayoutMode = "default" | "spread";
type ObsBgMode = "transparent" | "colour";

/**
 * Settings tab: how the overlay looks (layout for OBS cropping, background
 * colour/transparency), the lobby animation, and the BRB preset.
 */
export function SettingsPanel() {
  const {
    settings,
    syncSessionSettings,
    rawSessionSettings,
    lobbyMode,
    setLobbyMode,
    lobbyCatCount,
    setLobbyCatCount,
    lobbyMoveSpeed,
    setLobbyMoveSpeed,
    lobbySwapSpeed,
    setLobbySwapSpeed,
    lobbyCatMinSize,
    setLobbyCatMinSize,
    lobbyCatMaxSize,
    setLobbyCatMaxSize,
    lobbyAutoClearSeconds,
    setLobbyAutoClearSeconds,
    clearLobbyCats,
    brbSettingsCode,
    brbSettingsDraft,
    setBrbSettingsDraft,
    saveBrbSettingsCode,
  } = useStreamControl();

  // OBS appearance — follows the session settings, so a second open control
  // tab (or a reload) always shows the live values. Fresh local edits are
  // never reverted by in-flight echoes (useFollowGuard).
  const [layoutMode, setLayoutMode] = useState<ObsLayoutMode>("default");
  const [bgMode, setBgMode] = useState<ObsBgMode>("transparent");
  const [bgColour, setBgColour] = useState("#00ff00");
  const [bgOpacity, setBgOpacity] = useState(100);
  const { touch: touchLocalEdit, deferIfEditing, retryTick } = useFollowGuard();
  useEffect(() => {
    void retryTick;
    const raw = rawSessionSettings;
    if (!raw) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    if (raw.obsLayoutMode === "spread" || raw.obsLayoutMode === "default") {
      setLayoutMode(raw.obsLayoutMode);
    }
    if (raw.obsBgMode === "colour" || raw.obsBgMode === "transparent") {
      setBgMode(raw.obsBgMode);
    }
    if (typeof raw.obsBgColour === "string") setBgColour(raw.obsBgColour);
    if (typeof raw.obsBgOpacity === "number") setBgOpacity(raw.obsBgOpacity);
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  return (
    <div className="space-y-6">
      {/* OBS appearance */}
      <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
        <div className="border-b border-border/30 px-5 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            OBS Appearance
          </h3>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <span className="mb-2 block text-xs font-medium text-muted-foreground">
              Overlay Layout
            </span>
            <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
              {(
                [
                  ["default", "BeastyPage layout"],
                  ["spread", "Spread (crop your own)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => {
                    touchLocalEdit();
                    setLayoutMode(value);
                    syncSessionSettings({ obsLayoutMode: value });
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition",
                    layoutMode === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Spread gives every element its own region with 50px of space
              around it on a 2120×1180 canvas, so you can crop each one in OBS
              and build your own layout. Turn on Test mode to see every region's
              exact crop position.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
            <div>
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                Background
              </span>
              <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                {(
                  [
                    ["transparent", "Transparent"],
                    ["colour", "Solid colour"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      touchLocalEdit();
                      setBgMode(value);
                      syncSessionSettings({ obsBgMode: value });
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      bgMode === value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {bgMode === "colour" && (
              <>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Colour
                  <input
                    type="color"
                    value={bgColour}
                    onChange={(event) => {
                      touchLocalEdit();
                      setBgColour(event.target.value);
                      syncSessionSettings({ obsBgColour: event.target.value });
                    }}
                    className="h-9 w-16 cursor-pointer rounded-lg border border-border/50 bg-background"
                  />
                </label>
                <SliderControl
                  label="Opacity"
                  value={bgOpacity}
                  min={5}
                  max={100}
                  step={5}
                  format={(value) => `${value}%`}
                  onChange={(value) => {
                    touchLocalEdit();
                    setBgOpacity(value);
                    syncSessionSettings({ obsBgOpacity: value });
                  }}
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Lobby Animation */}
      <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Lobby Animation
          </h3>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/40 p-0.5">
            {(Object.keys(LOBBY_MODE_DEFAULTS) as LobbyMode[]).map((key) => {
              const defaults = LOBBY_MODE_DEFAULTS[key];
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setLobbyMode(key);
                    setLobbyCatCount(defaults.cats);
                    setLobbyMoveSpeed(defaults.move);
                    setLobbySwapSpeed(defaults.swap);
                    syncSessionSettings({
                      lobbyMode: key,
                      lobbyCatCount: defaults.cats,
                      lobbyMoveSpeed: defaults.move,
                      lobbySwapSpeed: defaults.swap,
                    });
                  }}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition",
                    lobbyMode === key
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {LOBBY_MODE_LABELS[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders grid — 3 columns, clean rows */}
        <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <SliderControl
            label="Cats on Screen"
            value={lobbyCatCount}
            min={1}
            max={12}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => {
              setLobbyCatCount(v);
              syncSessionSettings({ lobbyCatCount: v });
            }}
          />
          <SliderControl
            label="Move Speed"
            value={lobbyMoveSpeed}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyMoveSpeed(v);
              syncSessionSettings({ lobbyMoveSpeed: v });
            }}
          />
          <SliderControl
            label="Frame Swap"
            value={lobbySwapSpeed}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbySwapSpeed(v);
              syncSessionSettings({ lobbySwapSpeed: v });
            }}
          />
          <SliderControl
            label="Min Cat Size"
            value={lobbyCatMinSize}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyCatMinSize(v);
              if (v > lobbyCatMaxSize) setLobbyCatMaxSize(v);
              syncSessionSettings({
                lobbyCatMinSize: v,
                lobbyCatMaxSize: Math.max(v, lobbyCatMaxSize),
              });
            }}
          />
          <SliderControl
            label="Max Cat Size"
            value={lobbyCatMaxSize}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyCatMaxSize(v);
              if (v < lobbyCatMinSize) setLobbyCatMinSize(v);
              syncSessionSettings({
                lobbyCatMaxSize: v,
                lobbyCatMinSize: Math.min(v, lobbyCatMinSize),
              });
            }}
          />
          <SliderControl
            label="Auto-Clear Delay"
            value={lobbyAutoClearSeconds}
            min={5}
            max={120}
            step={5}
            format={(v) => `${v}s`}
            onChange={(v) => {
              setLobbyAutoClearSeconds(v);
              syncSessionSettings({ lobbyAutoClearSeconds: v });
            }}
          />
        </div>

        {/* Footer action */}
        <div className="border-t border-border/30 px-5 py-2.5">
          <button
            type="button"
            onClick={clearLobbyCats}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 transition",
              "hover:text-red-400",
            )}
          >
            <RotateCcw className="size-3" />
            Clear all cats from screen
          </button>
        </div>
      </section>

      <BrbPresetSection
        settings={settings}
        savedCode={brbSettingsCode}
        draftCode={brbSettingsDraft}
        onDraftChange={setBrbSettingsDraft}
        onSave={saveBrbSettingsCode}
      />
    </div>
  );
}
