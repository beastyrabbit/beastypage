"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import type { CSSProperties } from "react";
import type { BatchViewCat } from "./batchView";

/** Overlay canvas every batch look draws on. */
export const BATCH_CANVAS = { width: 1280, height: 1080 } as const;

/**
 * A cat sprite at the current reveal stage. Keyed by the preview url so the
 * previous stage's image stays until the next render lands. Renders a
 * transparent box until the first render exists so layouts never jump.
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
  if (!cat.previewUrl) {
    return <div className={className} style={base} aria-hidden="true" />;
  }
  return (
    <Image
      key={cat.previewUrl}
      src={cat.previewUrl}
      alt={cat.label}
      width={size}
      height={size}
      unoptimized
      className={`image-render-pixel object-contain ${className ?? ""}`}
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
