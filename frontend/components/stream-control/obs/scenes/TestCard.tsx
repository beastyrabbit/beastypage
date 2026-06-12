"use client";

import { SPREAD_CANVAS, SPREAD_REGIONS } from "../spreadLayout";

/**
 * Test mode — static layout guide for positioning the browser source in OBS.
 * Outlines every zone the overlay can draw into (lobby table, cat canvas,
 * param board, layer bar) on the fixed 1920x1080 stage. In spread layout it
 * instead shows every separated element region with its exact crop
 * coordinates on the larger spread canvas.
 */
export function TestCard({ spread = false }: { spread?: boolean }) {
  if (spread) {
    return <SpreadTestCard />;
  }
  return (
    <div
      className="relative"
      style={{
        width: "1920px",
        height: "1080px",
        background:
          "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px",
        border: "3px solid rgba(245, 158, 11, 0.6)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {/* Full-screen dimension label */}
      <div
        className="absolute flex items-center justify-center"
        style={{ inset: 0, pointerEvents: "none" }}
      >
        <span
          style={{
            fontSize: "80px",
            fontWeight: 900,
            color: "rgba(245, 158, 11, 0.08)",
            letterSpacing: "0.05em",
            fontFamily: "monospace",
          }}
        >
          1920 x 1080
        </span>
      </div>

      {/* Corner markers */}
      {[
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => (
        <div
          key={`corner-${x}-${y}`}
          className="absolute"
          style={{
            left: x ? undefined : 0,
            right: x ? 0 : undefined,
            top: y ? undefined : 0,
            bottom: y ? 0 : undefined,
            width: "30px",
            height: "30px",
            borderLeft: !x ? "3px solid rgba(245,158,11,0.5)" : undefined,
            borderRight: x ? "3px solid rgba(245,158,11,0.5)" : undefined,
            borderTop: !y ? "3px solid rgba(245,158,11,0.5)" : undefined,
            borderBottom: y ? "3px solid rgba(245,158,11,0.5)" : undefined,
          }}
        />
      ))}

      {/* ── Lobby: Settings table ── */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: "40px",
          top: "40px",
          width: "900px",
          height: "600px",
          border: "2px dashed rgba(59, 130, 246, 0.5)",
          borderRadius: "20px",
          background: "rgba(59, 130, 246, 0.03)",
        }}
      >
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "rgba(59, 130, 246, 0.6)",
            fontFamily: "monospace",
          }}
        >
          LOBBY — Settings Table
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "rgba(59, 130, 246, 0.4)",
            fontFamily: "monospace",
            marginTop: "4px",
          }}
        >
          900 x ~600 &middot; top-left
        </span>
      </div>

      {/* ── Spin: Cat canvas ── */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: "0px",
          top: "0px",
          width: "750px",
          height: "780px",
          border: "2px dashed rgba(34, 197, 94, 0.5)",
          borderRadius: "8px",
          background: "rgba(34, 197, 94, 0.03)",
        }}
      >
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "rgba(34, 197, 94, 0.6)",
            fontFamily: "monospace",
          }}
        >
          SPIN — Cat Canvas
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "rgba(34, 197, 94, 0.4)",
            fontFamily: "monospace",
            marginTop: "4px",
          }}
        >
          750 x 780 &middot; top-left
        </span>
      </div>

      {/* ── Spin: Param board (right column) ── */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: "750px",
          top: "20px",
          width: "510px",
          bottom: "220px",
          border: "2px dashed rgba(245, 158, 11, 0.5)",
          borderRadius: "20px",
          background: "rgba(245, 158, 11, 0.03)",
        }}
      >
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "rgba(245, 158, 11, 0.6)",
            fontFamily: "monospace",
          }}
        >
          SPIN — Param Board
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "rgba(245, 158, 11, 0.4)",
            fontFamily: "monospace",
            marginTop: "4px",
          }}
        >
          510 x ~840 &middot; right
        </span>
      </div>

      {/* ── Spin: Layer details (bottom bar) ── */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: "20px",
          bottom: "20px",
          right: "660px",
          height: "180px",
          border: "2px dashed rgba(168, 85, 247, 0.5)",
          borderRadius: "16px",
          background: "rgba(168, 85, 247, 0.03)",
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "rgba(168, 85, 247, 0.6)",
            fontFamily: "monospace",
          }}
        >
          SPIN — Layer Details
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "rgba(168, 85, 247, 0.4)",
            fontFamily: "monospace",
            marginTop: "4px",
          }}
        >
          ~1240 x 180 &middot; bottom
        </span>
      </div>

      {/* ── Flying cats area indicator ── */}
      <div
        className="absolute"
        style={{
          inset: "4px",
          border: "1px dotted rgba(255, 255, 255, 0.1)",
          borderRadius: "4px",
          pointerEvents: "none",
        }}
      />
      <div
        className="absolute"
        style={{
          right: "12px",
          top: "12px",
          fontSize: "11px",
          color: "rgba(255,255,255,0.2)",
          fontFamily: "monospace",
        }}
      >
        Flying cats: full 1920x1080
      </div>

      {/* TEST MODE badge */}
      <div
        className="absolute flex items-center gap-2"
        style={{
          left: "50%",
          bottom: "30px",
          transform: "translateX(-50%)",
          background: "rgba(245, 158, 11, 0.15)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "8px",
          padding: "8px 20px",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#f59e0b",
            animation: "obs-dot-pulse 1s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#f59e0b",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
          }}
        >
          TEST MODE — Position this source in OBS
        </span>
      </div>
    </div>
  );
}

/**
 * Spread layout guide: one labelled box per overlay element, with its exact
 * crop coordinates. The canvas is bigger than full HD on purpose — set the
 * browser source to the spread canvas size and crop each region in OBS.
 */
function SpreadTestCard() {
  return (
    <div
      className="relative"
      style={{
        width: `${SPREAD_CANVAS.width}px`,
        height: `${SPREAD_CANVAS.height}px`,
        background:
          "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px",
        border: "3px solid rgba(245, 158, 11, 0.6)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {Object.entries(SPREAD_REGIONS).map(([id, region]) => (
        <div
          key={id}
          className="absolute flex flex-col items-center justify-center"
          style={{
            left: `${region.left}px`,
            top: `${region.top}px`,
            width: `${region.width}px`,
            height: `${region.height}px`,
            border: `2px dashed rgba(${region.colour}, 0.6)`,
            borderRadius: "16px",
            background: `rgba(${region.colour}, 0.04)`,
          }}
        >
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: `rgba(${region.colour}, 0.85)`,
              fontFamily: "monospace",
            }}
          >
            {region.label}
          </span>
          <span
            style={{
              fontSize: "13px",
              color: `rgba(${region.colour}, 0.6)`,
              fontFamily: "monospace",
              marginTop: "4px",
            }}
          >
            crop x:{region.left} y:{region.top} · {region.width}×{region.height}
          </span>
        </div>
      ))}

      {/* TEST MODE badge */}
      <div
        className="absolute flex items-center gap-2"
        style={{
          left: "50%",
          bottom: "16px",
          transform: "translateX(-50%)",
          background: "rgba(245, 158, 11, 0.15)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "8px",
          padding: "8px 20px",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#f59e0b",
            animation: "obs-dot-pulse 1s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#f59e0b",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
          }}
        >
          SPREAD TEST — set the browser source to {SPREAD_CANVAS.width}×
          {SPREAD_CANVAS.height}, then crop each region
        </span>
      </div>
    </div>
  );
}
