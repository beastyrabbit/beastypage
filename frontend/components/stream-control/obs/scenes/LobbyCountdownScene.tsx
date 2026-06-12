"use client";

import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { type LobbySettings, OBSLobby } from "../../OBSLobby";

interface LobbyCountdownSceneProps {
  lobbySettings: LobbySettings;
  generator: CatGeneratorApi | null;
  showCountdown: boolean;
  countdownPreview: string | null;
  countdownValue: number;
  spinBoardVisible: boolean;
}

/**
 * Lobby + Countdown crossfade: both render as overlapping layers.
 * Lobby fades out over 3s while countdown fades in over 3s.
 */
export function LobbyCountdownScene({
  lobbySettings,
  generator,
  showCountdown,
  countdownPreview,
  countdownValue,
  spinBoardVisible,
}: LobbyCountdownSceneProps) {
  return (
    <div className="relative" style={{ width: "1920px", height: "1080px" }}>
      {/* Lobby layer — fades out when countdown starts */}
      <div
        className="absolute inset-0"
        style={{
          opacity: showCountdown ? 0 : 1,
          transition: "opacity 3s ease-in-out",
          pointerEvents: showCountdown ? "none" : "auto",
        }}
      >
        <OBSLobby settings={lobbySettings} generator={generator} />
      </div>

      {/* Countdown layer — fades in when countdown starts */}
      {showCountdown && (
        <div
          className="absolute inset-0"
          style={{
            opacity: 1,
            animation: "countdown-fade-in 3s ease-in-out",
          }}
        >
          <div
            className="relative"
            style={{ width: "1280px", height: "1080px" }}
          >
            <style>{`
              @keyframes countdown-pop {
                0% { transform: scale(1.4); opacity: 0.3; }
                30% { transform: scale(0.95); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes countdown-go {
                0% { transform: scale(0.5); opacity: 0; }
                40% { transform: scale(1.2); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes countdown-fade-in {
                0% { opacity: 0; }
                100% { opacity: 1; }
              }
            `}</style>

            {/* Cat preview cycling behind the number — in the cat canvas area */}
            <div
              className="absolute flex items-center justify-center"
              style={{
                left: "0px",
                top: "0px",
                width: "750px",
                height: "780px",
              }}
            >
              {countdownPreview && (
                // biome-ignore lint/performance/noImgElement: renders base64/dynamic src
                <img
                  src={countdownPreview}
                  alt=""
                  style={{
                    width: "720px",
                    height: "720px",
                    imageRendering: "pixelated",
                    opacity: 0.2,
                    filter: "blur(2px) saturate(1.3)",
                    transition: "opacity 0.15s",
                  }}
                />
              )}
            </div>

            {/* Countdown number / GO — centered over cat canvas area */}
            <div
              className="absolute flex items-center justify-center"
              style={{
                left: "0px",
                top: "0px",
                width: "750px",
                height: "780px",
              }}
            >
              <div
                key={countdownValue}
                style={{
                  fontSize: countdownValue === 0 ? "220px" : "300px",
                  fontWeight: 900,
                  color: countdownValue === 0 ? "#22c55e" : "#fbbf24",
                  textShadow:
                    countdownValue === 0
                      ? "0 0 100px rgba(34,197,94,0.6), 0 4px 30px rgba(0,0,0,0.7)"
                      : "0 0 80px rgba(251,191,36,0.5), 0 4px 30px rgba(0,0,0,0.7)",
                  lineHeight: 1,
                  animation:
                    countdownValue === 0
                      ? "countdown-go 0.6s ease-out"
                      : "countdown-pop 0.8s ease-out",
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                }}
              >
                {countdownValue === 0 ? "GO!" : countdownValue}
              </div>
            </div>

            {/* Spin board preview — fades in 3s before GO */}
            <div
              className="absolute flex flex-col overflow-hidden"
              style={{
                left: "750px",
                top: "20px",
                width: "510px",
                bottom: "220px",
                background:
                  "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
                borderRadius: "20px",
                border: "2px solid rgba(245, 158, 11, 0.2)",
                boxShadow:
                  "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
                opacity: spinBoardVisible ? 1 : 0,
                transition: "opacity 3s ease-in-out",
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  height: "100px",
                  borderBottom: "1px solid rgba(245, 158, 11, 0.1)",
                  padding: "20px 28px",
                }}
              >
                <span className="text-xs uppercase tracking-[0.3em] text-zinc-700">
                  Ready
                </span>
              </div>
            </div>

            {/* Bottom layer bar preview — fades in with the board */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: "20px",
                bottom: "20px",
                right: "20px",
                background:
                  "linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 50%, rgba(10,10,10,0.92) 100%)",
                borderRadius: "16px",
                border: "2px solid rgba(245, 158, 11, 0.2)",
                boxShadow:
                  "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
                padding: "14px 32px",
                opacity: spinBoardVisible ? 1 : 0,
                transition: "opacity 3s ease-in-out",
              }}
            >
              <span className="text-xs uppercase tracking-[0.3em] text-zinc-700">
                Layers
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
