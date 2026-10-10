"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrbPresetSection } from "./BrbPresetSection";
import { useStreamControl } from "./context";
import { SliderControl } from "./controls";
import {
  formatMultiplier,
  LOBBY_MODE_DEFAULTS,
  type LobbyMode,
} from "./helpers";

const LOBBY_MODE_LABELS: Record<LobbyMode, string> = {
  "fruit-ninja": "Fruit Ninja",
  matrix: "Matrix",
  dvd: "DVD Bounce",
  parade: "Parade",
  orbit: "Orbit",
  bubbles: "Bubbles",
};

/**
 * Settings tab: the lobby animation and the BRB preset. The overlay's look
 * (theme, layout, background) lives in the Look tab.
 */
export function SettingsPanel() {
  const {
    settings,
    syncSessionSettings,
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

  return (
    <div className="space-y-6">
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
            format={String}
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
