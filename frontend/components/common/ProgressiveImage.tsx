"use client";

/* eslint-disable @next/next/no-img-element */

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const FALLBACK_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8/5+hHgAHpgJ/qofE3AAAAABJRU5ErkJggg==";

type ProgressiveImageProps = {
  lowSrc?: string | null;
  highSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  imgStyle?: CSSProperties;
  loading?: "eager" | "lazy";
};

export function ProgressiveImage({
  lowSrc,
  highSrc,
  alt,
  className,
  imgClassName,
  imgStyle,
  loading = "lazy",
}: Readonly<ProgressiveImageProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highState, setHighState] = useState<{
    loaded: string | null;
    failed: string | null;
    low: string | null | undefined;
  }>({ loaded: null, failed: null, low: undefined });
  const nextHigh = highSrc ?? lowSrc;
  const baseSrc = lowSrc ?? highSrc ?? FALLBACK_IMG;
  const highLoaded =
    nextHigh !== undefined &&
    highState.loaded === nextHigh &&
    highState.low === lowSrc;
  const highFailed =
    nextHigh !== undefined &&
    highState.failed === nextHigh &&
    highState.low === lowSrc;
  const state = {
    src: highLoaded ? (nextHigh ?? baseSrc) : baseSrc,
    sharp: !lowSrc || lowSrc === nextHigh || highLoaded || highFailed,
  };

  useEffect(() => {
    if (!lowSrc || !nextHigh || lowSrc === nextHigh) return;

    let cancelled = false;
    let started = false;
    let observer: IntersectionObserver | undefined;
    const loadHigh = () => {
      if (started || cancelled) return;
      started = true;
      const img = new Image();
      img.src = nextHigh;
      img.onload = () => {
        if (cancelled) return;
        setHighState({ loaded: nextHigh, failed: null, low: lowSrc });
      };
      img.onerror = () => {
        if (cancelled) return;
        setHighState({ loaded: null, failed: nextHigh, low: lowSrc });
      };
    };

    if (loading === "eager" || typeof IntersectionObserver === "undefined") {
      loadHigh();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadHigh();
            observer?.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      if (containerRef.current) observer.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [loading, lowSrc, nextHigh]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      {/* biome-ignore lint/performance/noImgElement: progressive loading with dynamic src */}
      <img
        src={state.src}
        alt={alt}
        loading={loading}
        style={imgStyle}
        className={cn(
          "h-full w-full object-cover transition duration-500",
          state.sharp ? "blur-0 scale-100" : "blur-md scale-[1.02]",
          imgClassName,
        )}
      />
    </div>
  );
}

export default ProgressiveImage;
