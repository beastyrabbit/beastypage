"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrBadgeProps {
  url: string;
  label?: string;
  /** QR module size in px — keep ≥ 180 so phones can scan it off a 1080p stream. */
  size?: number;
}

/**
 * Solid light card with a QR code, for the transparent OBS overlay. The
 * padding doubles as the QR quiet zone; fades in on mount.
 */
export function QrBadge({
  url,
  label = "Scan to view",
  size = 190,
}: QrBadgeProps) {
  return (
    <div
      style={{ animation: "obs-qr-fade-in 400ms ease", pointerEvents: "none" }}
    >
      <style>{`
        @keyframes obs-qr-fade-in {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="flex flex-col items-center gap-2 rounded-2xl border px-4 pb-3 pt-4"
        style={{
          background: "rgba(250, 250, 249, 0.97)",
          borderColor: "rgba(245, 158, 11, 0.45)",
          boxShadow:
            "0 14px 40px rgba(0,0,0,0.45), 0 0 30px rgba(245,158,11,0.10)",
        }}
      >
        <QRCodeSVG
          value={url}
          size={size}
          bgColor="transparent"
          fgColor="#1c1917"
          level="M"
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-600">
          {label}
        </span>
      </div>
    </div>
  );
}
