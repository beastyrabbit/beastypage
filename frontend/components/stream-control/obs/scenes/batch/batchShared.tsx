"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import type { CSSProperties } from "react";
import type { BatchViewCat } from "./batchView";

/** Overlay canvas every batch look draws on. */
export const BATCH_CANVAS = { width: 1280, height: 1080 } as const;

/**
 * A cat sprite at the current reveal stage. The `src` swaps in place when
 * the next stage's frame is published (no remount, so the wrapper's rect
 * measurements and FLIP keep the same element). Renders a transparent box
 * until the first render exists so layouts never jump. The root carries
 * `data-batch-cat` for the wrapper and `obs-batch-landed` while the cat's
 * changed frame has just landed (the class drops at the next windup, so the
 * flash replays once per stage per cat).
 */
export function BatchSprite({
  cat,
  size,
  flip = false,
  style,
  className,
}: Readonly<{
  cat: BatchViewCat;
  size: number;
  flip?: boolean;
  style?: CSSProperties;
  className?: string;
}>) {
  const base: CSSProperties = {
    width: size,
    height: size,
    transform: flip ? "scaleX(-1)" : undefined,
    ...style,
  };
  const landed = cat.landed ? "1" : "0";
  const landedClass = cat.landed && cat.changed ? " obs-batch-landed" : "";
  if (!cat.previewUrl) {
    return (
      <div
        data-batch-cat={cat.id}
        data-landed={landed}
        className={`${className ?? ""}${landedClass}`}
        style={base}
        aria-hidden="true"
      />
    );
  }
  return (
    <Image
      data-batch-cat={cat.id}
      data-landed={landed}
      src={cat.previewUrl}
      alt={cat.label}
      width={size}
      height={size}
      unoptimized
      className={`image-render-pixel object-contain ${className ?? ""}${landedClass}`}
      style={base}
    />
  );
}

/** Bare QR (no card) so each look can frame it as its own object. */
export function BatchQr({
  url,
  size,
  fg = "#000000",
  bg = "#ffffff",
}: Readonly<{ url: string; size: number; fg?: string; bg?: string }>) {
  return (
    <QRCodeSVG
      value={url}
      size={size}
      level="M"
      marginSize={2}
      fgColor={fg}
      bgColor={bg}
      style={{ display: "block" }}
    />
  );
}

/** "08 09 15" — culled numbers in elimination order. */
export function eliminatedNumbers(cats: readonly BatchViewCat[]): string {
  return cats.map((cat) => cat.numberLabel).join(" ");
}

/** Survivors without the spotlight cat (looks that move it elsewhere). */
export function floorCats(
  survivors: readonly BatchViewCat[],
  spotlight: BatchViewCat | null,
): BatchViewCat[] {
  return spotlight
    ? survivors.filter((cat) => cat.id !== spotlight.id)
    : [...survivors];
}
