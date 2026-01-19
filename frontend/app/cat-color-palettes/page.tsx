'use client';

import { useState, useMemo } from 'react';
import { Palette, Check } from 'lucide-react';
import { toast } from 'sonner';
import { PageHero } from '@/components/common/PageHero';
import { ADDITIONAL_PALETTES, type PaletteCategory } from '@/lib/palettes';

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function ColorCard({
  name,
  rgb,
  screen,
}: {
  name: string;
  rgb: [number, number, number];
  screen?: [number, number, number, number];
}) {
  const [copied, setCopied] = useState(false);
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      toast.success(`Copied ${hex}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Determine if text should be light or dark based on luminance
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const textColor = luminance > 0.5 ? 'text-black/80' : 'text-white/90';

  return (
    <button
      onClick={copyToClipboard}
      className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border/30 transition hover:scale-105 hover:shadow-lg"
      style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
      title={`${name}\n${hex}\nClick to copy`}
    >
      <div className={`text-center ${textColor}`}>
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100">
          {name.replace(/_/g, ' ')}
        </div>
        <div className="mt-0.5 text-[9px] font-mono opacity-60 group-hover:opacity-90">
          {hex.toUpperCase()}
        </div>
      </div>
      {copied && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Check className="size-6 text-white" />
        </div>
      )}
      {screen && (
        <div className="absolute bottom-1 right-1">
          <div
            className="size-2 rounded-full border border-white/30"
            style={{
              backgroundColor: `rgba(${screen[0]}, ${screen[1]}, ${screen[2]}, ${screen[3]})`,
            }}
            title="Has screen overlay"
          />
        </div>
      )}
    </button>
  );
}

function PaletteSection({ palette }: { palette: PaletteCategory }) {
  const colors = Object.entries(palette.colors);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Palette className="size-5 text-primary" />
          {palette.label}
          <span className="text-sm font-normal text-muted-foreground">
            ({colors.length} colors)
          </span>
        </h2>
        {palette.description && (
          <p className="mt-1 text-sm text-muted-foreground">{palette.description}</p>
        )}
      </div>

      <div className="border-t border-border/30 px-6 py-4">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {colors.map(([name, def]) => (
            <ColorCard
              key={name}
              name={name}
              rgb={def.multiply}
              screen={def.screen}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CatColorPalettesPage() {
  // Count total colors
  const totalColors = useMemo(
    () => ADDITIONAL_PALETTES.reduce((sum, p) => sum + Object.keys(p.colors).length, 0),
    []
  );

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <PageHero
          eyebrow="Artist Tools"
          title="Cat Color Palettes"
          description={`Browse ${ADDITIONAL_PALETTES.length} experimental color palettes with ${totalColors} unique colors for cat generation. Click any color to copy its hex code.`}
        />

        {/* Palette sections */}
        <div className="space-y-4">
          {ADDITIONAL_PALETTES.map((palette) => (
            <PaletteSection key={palette.id} palette={palette} />
          ))}
        </div>

        {/* Info footer */}
        <div className="mt-8 rounded-lg border border-border/30 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          <p>
            These colors are applied using multiply blend mode on WHITE base sprites.
            Colors with a small dot indicator also have a screen overlay for added depth.
          </p>
        </div>
      </div>
    </main>
  );
}
