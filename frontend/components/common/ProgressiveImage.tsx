"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FALLBACK_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8/5+hHgAHpgJ/qofE3AAAAABJRU5ErkJggg==";

type ProgressiveImageProps = {
  lowSrc?: string | null;
  highSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
};

export function ProgressiveImage({
  lowSrc,
  highSrc,
  alt,
  className,
  imgClassName,
  loading = "lazy"
}: ProgressiveImageProps) {
  const [state, setState] = useState(() => ({
    src: lowSrc ?? highSrc ?? FALLBACK_IMG,
    sharp: !lowSrc || lowSrc === highSrc
  }));

  useEffect(() => {
    const nextHigh = highSrc ?? lowSrc;
    if (!nextHigh) return;
    if (state.src === nextHigh && state.sharp) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const img = new window.Image();
    img.src = nextHigh;
    img.onload = () => {
      if (cancelled) return;
      setState({ src: nextHigh, sharp: true });
    };
    img.onerror = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, sharp: true }));
    };

    return () => {
      cancelled = true;
    };
  }, [highSrc, lowSrc, state.src, state.sharp]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <img
        src={state.src}
        alt={alt}
        loading={loading}
        className={cn(
          "h-full w-full object-cover transition duration-500",
          state.sharp ? "blur-0 scale-100" : "blur-md scale-[1.02]",
          imgClassName
        )}
      />
    </div>
  );
}

export default ProgressiveImage;
