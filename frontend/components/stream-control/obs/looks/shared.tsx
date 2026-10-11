"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import type { CSSProperties } from "react";

/**
 * A rendered cat sprite at `size` px, pixel-crisp; a quiet dot while it renders.
 * `catId` marks the root `[data-batch-cat]` for the batch wrapper (numeral,
 * leader lines, FLIP); `landed` plays the 300 ms `look-land` flash while true.
 */
export function LookSprite({
  url,
  alt,
  size,
  style,
  className,
  placeholderColor = "currentColor",
  catId,
  landed,
}: Readonly<{
  url: string | null;
  alt: string;
  size: number;
  style?: CSSProperties;
  className?: string;
  placeholderColor?: string;
  catId?: string;
  landed?: boolean;
}>) {
  const landClass = landed ? "look-land" : "";
  if (!url) {
    return (
      <div
        aria-hidden="true"
        data-batch-cat={catId}
        className={`${className ?? ""} ${landClass}`.trim() || undefined}
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: placeholderColor,
          opacity: 0.35,
          fontSize: Math.max(10, size / 8),
          ...style,
        }}
      >
        …
      </div>
    );
  }
  return (
    <Image
      key={url}
      src={url}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      data-batch-cat={catId}
      className={`image-render-pixel object-contain ${className ?? ""} ${landClass}`.trim()}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** QR with a transparent background so each look can set its own paper. */
export function LookQr({
  url,
  size,
  fg = "#1c1917",
  style,
}: Readonly<{
  url: string;
  size: number;
  fg?: string;
  style?: CSSProperties;
}>) {
  return (
    <QRCodeSVG
      value={url}
      size={size}
      bgColor="transparent"
      fgColor={fg}
      level="M"
      style={style}
    />
  );
}

/** "01", "02" … pool numbers so chat can refer to a kit by number. */
export function poolNumber(index: number): string {
  return (index + 1).toString().padStart(2, "0");
}

/** Shared keyframes (pulses, leaves, pops, wipes, stamps, draws …). */
export { LOOK_MOTION_KEYFRAMES as LOOK_KEYFRAMES } from "./motion";
