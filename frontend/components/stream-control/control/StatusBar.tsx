"use client";

import { Copy, Eye, Radio, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStreamControl } from "./context";

/**
 * Persistent bar above the tab panels: scene buttons (Lobby / BRB / Test /
 * Clear) and the OBS browser-source URL copy action — always reachable no
 * matter which tab is active.
 */
export function StatusBar() {
  const {
    obsUrl,
    activeScene,
    commandBusy,
    testMode,
    runLobbyScene,
    runBrbScene,
    runTestScene,
    runClearScene,
  } = useStreamControl();

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-background/80 p-3 backdrop-blur">
      <div className="grid flex-1 grid-cols-4 gap-2">
        {(
          [
            {
              label: "Lobby",
              desc: "Settings + cats",
              icon: Eye,
              onClick: runLobbyScene,
              pressed: activeScene === "lobby",
              danger: false,
            },
            {
              label: "BRB",
              desc: "Cats only",
              icon: Timer,
              onClick: runBrbScene,
              pressed: activeScene === "brb",
              danger: false,
            },
            {
              label: "Test",
              desc: testMode ? "On" : "Debug border",
              icon: Radio,
              onClick: runTestScene,
              pressed: activeScene === "test",
              danger: false,
            },
            {
              label: "Clear",
              desc: "Hide overlay",
              icon: Square,
              onClick: runClearScene,
              pressed: undefined,
              danger: true,
            },
          ] as const
        ).map((btn) => {
          let borderClass: string;
          let iconClass: string;
          if (btn.pressed) {
            borderClass = "border-amber-500/50 bg-amber-500/10";
            iconClass = "text-amber-500";
          } else if (btn.danger) {
            borderClass =
              "border-border/50 hover:border-red-500/40 hover:bg-red-500/5";
            iconClass = "text-muted-foreground group-hover:text-red-400";
          } else {
            borderClass =
              "border-border/50 hover:border-amber-500/40 hover:bg-amber-500/5";
            iconClass = "text-muted-foreground group-hover:text-amber-500";
          }
          return (
            <button
              type="button"
              key={btn.label}
              onClick={btn.onClick}
              aria-pressed={btn.pressed}
              disabled={commandBusy}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                "disabled:cursor-not-allowed disabled:opacity-60",
                borderClass,
              )}
            >
              <btn.icon
                className={cn("size-4 shrink-0 transition", iconClass)}
              />
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-xs font-semibold",
                    btn.pressed ? "text-amber-400" : "text-foreground",
                  )}
                >
                  {btn.label}
                </div>
                <div className="truncate text-[10px] text-muted-foreground/60">
                  {btn.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>

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
            "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5",
            "text-xs font-medium text-muted-foreground transition",
            "hover:bg-foreground hover:text-background",
          )}
        >
          <Copy className="size-3" />
          Copy OBS URL
        </button>
      )}
    </section>
  );
}
