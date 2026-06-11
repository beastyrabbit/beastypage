"use client";

import Image from "next/image";

/** Name input with a sprite preview pop-up on hover/focus. */
export function NameField({
  value,
  placeholder,
  previewUrl,
  onChange,
}: {
  value: string;
  placeholder: string;
  previewUrl: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="group/name relative min-w-0 flex-1">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
      />
      {previewUrl ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 hidden -translate-x-1/2 pb-2 group-focus-within/name:block group-hover/name:block">
          <div className="rounded-xl border border-border/60 bg-slate-950/95 p-2 shadow-2xl">
            <Image
              src={previewUrl}
              alt={value || placeholder}
              width={112}
              height={112}
              unoptimized
              className="image-render-pixel size-28"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
