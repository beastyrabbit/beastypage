import type { CSSProperties } from "react";
import type { ClassicWheelPrize } from "@/lib/wheel/classicWheel";
import type { OverlayThemeId } from "./themeMeta";

/**
 * Per-theme look for the prize wheel and its reward banner. The wheel itself
 * is drawn by `spin-wheel` (segments, labels, lines, border); everything
 * around it (rim, ticks, pointer, hub) is CSS in OBSClassicWheel.
 */
export interface WheelSkin {
  /** Segment background per prize, in prize order. */
  segments: (prizes: readonly ClassicWheelPrize[]) => string[];
  /** Label colour per prize (cycles), in prize order. */
  labelColors: (prizes: readonly ClassicWheelPrize[]) => string[];
  labelFont: string;
  /** Outline behind the label text (for legibility on busy segments). */
  labelStroke?: string;
  lineColor: string;
  lineWidth: number;
  borderColor: string;
  borderWidth: number;
  /** Disc background behind the segments. */
  faceBg: string;
  /** Extra styles for the disc container (outer rim, shadows). */
  rim: CSSProperties;
  /** Optional tick ring drawn just outside the disc: colour and spacing in degrees. */
  ticks?: { color: string; every: number; inset: number; width: number };
  pointer: {
    shape: "triangle" | "needle" | "roundel";
    color: string;
    shadow: string;
  };
  /** Optional hub cap in the middle of the disc. */
  hub?: { size: number; style: CSSProperties; glyph?: string };
  /** The soft pool behind the wheel that hides the cat; defaults to a dark one. */
  pool?: string;
  banner: {
    caption: string;
    style: CSSProperties;
    captionStyle: CSSProperties;
    valueStyle: CSSProperties;
    /** When false the value keeps the banner's own colour instead of the prize colour. */
    valueUsesPrizeColor: boolean;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix `hex` toward `toward` by `t` (0 = hex, 1 = toward). */
export function mixHex(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = '"Helvetica Neue", Inter, "Segoe UI", Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
const TYPEWRITER = '"Courier New", Courier, monospace';

const TRANSIT_COLOURS = [
  "#f2b544",
  "#58c4ff",
  "#efe9dc",
  "#ff7a59",
  "#7fe0ff",
  "#c9a2ff",
  "#9bf542",
];

/** Today's wheel, unchanged. */
const CLASSIC: WheelSkin = {
  segments: (prizes) => prizes.map((p) => p.color),
  labelColors: () => ["#ffffff"],
  labelFont: "Geist Sans, Inter, Arial, sans-serif",
  lineColor: "rgba(255,255,255,0.72)",
  lineWidth: 3,
  borderColor: "rgba(255,255,255,0.22)",
  borderWidth: 4,
  faceBg: "#0b0f1a",
  rim: {
    border: "1px solid rgba(254, 243, 199, 0.1)",
    boxShadow: "inset 0 20px 60px rgba(0,0,0,0.55)",
  },
  pointer: {
    shape: "triangle",
    color: "#fcd34d",
    shadow: "0 8px 18px rgba(253, 230, 138, 0.45)",
  },
  banner: {
    caption: "Wheel Reward",
    style: {
      background: "var(--obs-panel-bg)",
      border: "2px solid var(--obs-panel-border)",
      boxShadow: "var(--obs-panel-shadow)",
      borderRadius: "var(--obs-panel-radius)",
    },
    captionStyle: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.25em",
      color: "var(--obs-muted)",
    },
    valueStyle: {
      fontSize: 24,
      fontWeight: 900,
      letterSpacing: "0.08em",
      textShadow: "0 0 18px rgba(0,0,0,0.55)",
    },
    valueUsesPrizeColor: true,
  },
};

/** Field guide plate: a dusky protractor with a tick ring and a specimen-red pointer. */
const PLATE: WheelSkin = {
  segments: (prizes) => prizes.map((p) => mixHex(p.color, "#1b1f24", 0.58)),
  labelColors: () => ["#e9e4d8"],
  labelFont: SANS,
  lineColor: "rgba(233, 228, 216, 0.35)",
  lineWidth: 1.2,
  borderColor: "rgba(233, 228, 216, 0.5)",
  borderWidth: 1.5,
  faceBg: "rgba(27, 31, 36, 0.96)",
  rim: {
    boxShadow:
      "0 0 0 14px rgba(27, 31, 36, 0.92), 0 0 0 15.5px rgba(233, 228, 216, 0.35), 0 18px 40px rgba(0,0,0,0.5)",
  },
  ticks: { color: "rgba(233, 228, 216, 0.55)", every: 10, inset: 14, width: 7 },
  pointer: {
    shape: "triangle",
    color: "#d9583b",
    shadow: "0 6px 14px rgba(217, 88, 59, 0.45)",
  },
  hub: {
    size: 64,
    style: {
      background: "rgba(27, 31, 36, 0.98)",
      border: "1.5px solid rgba(233, 228, 216, 0.5)",
      color: "#8a9099",
      fontFamily: MONO,
      fontSize: 14,
      letterSpacing: "0.2em",
    },
    glyph: "N",
  },
  banner: {
    caption: "reward",
    style: {
      background: "rgba(27, 31, 36, 0.92)",
      border: "1.5px solid rgba(233, 228, 216, 0.3)",
      color: "#e9e4d8",
    },
    captionStyle: {
      fontFamily: SERIF,
      fontStyle: "italic",
      fontSize: 18,
      color: "#8a9099",
    },
    valueStyle: { fontFamily: SANS, fontSize: 26, fontWeight: 600 },
    valueUsesPrizeColor: true,
  },
};

/** Cross-stitch: a cloth disc in a wooden hoop, pointed at by the needle. */
const SAMPLER: WheelSkin = {
  segments: (prizes) =>
    prizes.map((_, i) => (i % 2 === 0 ? "#f3ecdc" : "#d9cdae")),
  labelColors: () => ["#2a2622"],
  labelFont: SERIF,
  labelStroke: "rgba(239, 230, 211, 0.9)",
  lineColor: "#c43b3b",
  lineWidth: 2,
  borderColor: "#6f4a22",
  borderWidth: 6,
  faceBg: "#efe6d3",
  // The scene already draws the hoop; the disc is a pattern laid on the
  // cloth: thin wood edge plus a red running-stitch outline.
  rim: {
    boxShadow:
      "0 0 0 5px #6f4a22, 0 0 0 9px #efe6d3, 0 0 0 11px transparent, 0 14px 30px rgba(0,0,0,0.35)",
    outline: "2px dashed #c43b3b",
    outlineOffset: 9,
  },
  pool: "rgba(60, 40, 20, 0.28)",
  pointer: {
    shape: "needle",
    color: "#c6c9cf",
    shadow: "0 4px 10px rgba(0,0,0,0.4)",
  },
  hub: {
    size: 58,
    style: {
      background: "#6f4a22",
      border: "4px solid #b07a3f",
      color: "#e8d9b8",
      fontSize: 22,
    },
    glyph: "×",
  },
  banner: {
    caption: "prize thread",
    style: {
      background: "#f8f4ea",
      border: "1.5px dashed rgba(42, 38, 34, 0.45)",
      color: "#2a2622",
      boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
    },
    captionStyle: {
      fontFamily: MONO,
      fontSize: 13,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      color: "#6e6a63",
    },
    valueStyle: { fontFamily: SERIF, fontSize: 28, fontWeight: 700 },
    valueUsesPrizeColor: false,
  },
};

/** StarClan: a night disc with starry segment tints, gold labels and a cyan pointer. */
const STARCHART: WheelSkin = {
  segments: (prizes) => prizes.map((p) => mixHex(p.color, "#0b1226", 0.72)),
  labelColors: () => ["#f2d27a"],
  labelFont: SERIF,
  lineColor: "#27324d",
  lineWidth: 1.5,
  borderColor: "rgba(242, 210, 122, 0.6)",
  borderWidth: 1.5,
  faceBg: "rgba(7, 11, 22, 0.96)",
  rim: {
    boxShadow:
      "0 0 0 14px rgba(7, 11, 22, 0.9), 0 0 0 15px #27324d, 0 0 60px rgba(127, 224, 255, 0.12)",
  },
  ticks: { color: "#5b6a8a", every: 15, inset: 14, width: 6 },
  pointer: {
    shape: "triangle",
    color: "#7fe0ff",
    shadow: "0 0 18px rgba(127, 224, 255, 0.6)",
  },
  hub: {
    size: 70,
    style: {
      background: "rgba(7, 11, 22, 0.98)",
      border: "1.5px solid rgba(242, 210, 122, 0.6)",
      color: "#f2d27a",
      fontSize: 30,
    },
    glyph: "☾",
  },
  banner: {
    caption: "omen",
    style: {
      background: "rgba(7, 11, 22, 0.9)",
      border: "1.5px solid #27324d",
      color: "#c9d3e6",
    },
    captionStyle: {
      fontFamily: SERIF,
      fontStyle: "italic",
      fontSize: 18,
      color: "#5b6a8a",
    },
    valueStyle: {
      fontFamily: SERIF,
      fontSize: 28,
      fontWeight: 600,
      color: "#f2d27a",
      textShadow: "0 0 18px rgba(242, 210, 122, 0.45)",
    },
    valueUsesPrizeColor: false,
  },
};

/** Transit: bold line colours, thick white separators, a station roundel as the pointer. */
const TRANSIT: WheelSkin = {
  segments: (prizes) =>
    prizes.map((_, i) => TRANSIT_COLOURS[i % TRANSIT_COLOURS.length]),
  labelColors: (prizes) =>
    prizes.map((_, i) =>
      luminance(TRANSIT_COLOURS[i % TRANSIT_COLOURS.length]) > 0.6
        ? "#111111"
        : "#ffffff",
    ),
  labelFont: SANS,
  labelStroke: "transparent",
  lineColor: "#ffffff",
  lineWidth: 6,
  borderColor: "#ffffff",
  borderWidth: 8,
  faceBg: "#ffffff",
  rim: {
    boxShadow: "0 0 0 4px #111111, 0 18px 40px rgba(0,0,0,0.55)",
  },
  pointer: {
    shape: "roundel",
    color: "#ffffff",
    shadow: "0 6px 14px rgba(0,0,0,0.5)",
  },
  hub: {
    size: 72,
    style: {
      background: "#ffffff",
      border: "6px solid #111111",
      color: "#111111",
      fontFamily: SANS,
      fontWeight: 800,
      fontSize: 22,
    },
    glyph: "W",
  },
  banner: {
    caption: "Reward",
    style: {
      background: "#ffffff",
      color: "#111111",
      borderRadius: 999,
      boxShadow: "0 0 0 4px #111111, 0 12px 30px rgba(0,0,0,0.5)",
    },
    captionStyle: {
      fontFamily: SANS,
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      background: "#f2b544",
      color: "#111111",
      padding: "4px 10px",
      borderRadius: 999,
    },
    valueStyle: { fontFamily: SANS, fontSize: 26, fontWeight: 800 },
    valueUsesPrizeColor: false,
  },
};

/** Mixtape: a cassette reel — cardstock segments in a dark shell, typewriter labels. */
const MIXTAPE: WheelSkin = {
  segments: (prizes) =>
    prizes.map((_, i) => (i % 2 === 0 ? "#f1ece0" : "#e2dac8")),
  labelColors: () => ["#1f1c18"],
  labelFont: TYPEWRITER,
  labelStroke: "rgba(241, 236, 224, 0.9)",
  lineColor: "#1f1c18",
  lineWidth: 1.5,
  borderColor: "#2b2b2e",
  borderWidth: 10,
  faceBg: "#f1ece0",
  rim: {
    boxShadow:
      "0 0 0 10px #2b2b2e, 0 0 0 12px #3d3d41, 0 20px 46px rgba(0,0,0,0.55)",
  },
  pool: "rgba(31, 28, 24, 0.22)",
  pointer: {
    shape: "triangle",
    color: "#2f6fde",
    shadow: "0 6px 14px rgba(47, 111, 222, 0.45)",
  },
  hub: {
    size: 96,
    style: {
      background: "#d9d4c6",
      border: "10px dotted #2b2b2e",
      color: "#2b2b2e",
    },
  },
  banner: {
    caption: "bonus track —",
    style: {
      background: "#f1ece0",
      border: "1.5px solid rgba(31, 28, 24, 0.35)",
      color: "#1f1c18",
      boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
    },
    captionStyle: {
      fontFamily: TYPEWRITER,
      fontSize: 16,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "#2f6fde",
    },
    valueStyle: {
      fontFamily: TYPEWRITER,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    },
    valueUsesPrizeColor: false,
  },
};

export const WHEEL_SKINS: Record<OverlayThemeId, WheelSkin> = {
  classic: CLASSIC,
  plate: PLATE,
  sampler: SAMPLER,
  starchart: STARCHART,
  transit: TRANSIT,
  mixtape: MIXTAPE,
};

export function wheelSkinFor(theme: OverlayThemeId | undefined): WheelSkin {
  return WHEEL_SKINS[theme ?? "classic"];
}
