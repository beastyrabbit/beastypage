'use client';

import { useState, useMemo, useCallback } from 'react';
import { Palette, Check, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHero } from '@/components/common/PageHero';
import { ADDITIONAL_PALETTES, type PaletteCategory } from '@/lib/palettes';
import {
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToCmyk,
  rgbToOklch,
} from '@/lib/color-extraction/color-utils';
import type { RGB } from '@/lib/color-extraction/types';
import { generateACO } from '@/lib/color-extraction/palette-formats';

const COLOR_FORMATS = ['hex', 'rgb', 'hsl', 'hsv', 'cmyk', 'oklch'] as const;

type ColorFormat = (typeof COLOR_FORMATS)[number];

function formatColor(
  rgb: [number, number, number],
  format: ColorFormat
): { display: string; clipboard: string } {
  const rgbObj: RGB = { r: rgb[0], g: rgb[1], b: rgb[2] };

  switch (format) {
    case 'hex': {
      const hex = rgbToHex(rgbObj).toUpperCase();
      return { display: hex, clipboard: hex };
    }
    case 'rgb': {
      const display = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      return { display, clipboard: `rgb(${display})` };
    }
    case 'hsl': {
      const hsl = rgbToHsl(rgbObj);
      const display = `${hsl.h}\u00B0, ${hsl.s}%, ${hsl.l}%`;
      return { display, clipboard: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` };
    }
    case 'hsv': {
      const hsv = rgbToHsv(rgbObj);
      const display = `${hsv.h}\u00B0, ${hsv.s}%, ${hsv.v}%`;
      return { display, clipboard: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)` };
    }
    case 'cmyk': {
      const cmyk = rgbToCmyk(rgbObj);
      const display = `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
      return {
        display,
        clipboard: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
      };
    }
    case 'oklch': {
      const oklch = rgbToOklch(rgbObj);
      const display = `${oklch.l}, ${oklch.c}, ${oklch.h}`;
      return { display, clipboard: `oklch(${oklch.l} ${oklch.c} ${oklch.h})` };
    }
  }
}

function PaletteDownload({ palette }: { palette: PaletteCategory }) {
  const handleExport = useCallback(() => {
    const colors = Object.entries(palette.colors).map(([name, def]) => ({
      rgb: { r: def.multiply[0], g: def.multiply[1], b: def.multiply[2] },
      name: name.replace(/_/g, ' '),
    }));

    if (colors.length === 0) {
      toast.error('No colors to export');
      return;
    }

    try {
      const data = generateACO(colors);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${palette.label}.aco`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Downloaded ${palette.label} as ACO`);
    } catch (err) {
      console.error('ACO export failed:', err);
      toast.error(`Failed to export ${palette.label} as ACO`);
    }
  }, [palette]);

  return (
    <button
      onClick={handleExport}
      className="flex h-7 items-center gap-1.5 rounded-md bg-primary/15 px-2.5 text-xs font-medium text-primary transition hover:bg-primary/25"
    >
      <Download className="size-3" />
      ACO
    </button>
  );
}

function ColorCard({
  name,
  rgb,
  screen,
  colorFormat,
}: {
  name: string;
  rgb: [number, number, number];
  screen?: [number, number, number, number];
  colorFormat: ColorFormat;
}) {
  const [copied, setCopied] = useState(false);
  const { display, clipboard } = formatColor(rgb, colorFormat);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(clipboard);
      setCopied(true);
      toast.success(`Copied ${clipboard}`);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      toast.error('Failed to copy');
    }
  };

  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const textColor = luminance > 0.5 ? 'text-black/80' : 'text-white/90';

  return (
    <button
      onClick={copyToClipboard}
      className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border/30 transition hover:scale-105 hover:shadow-lg"
      style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
      title={`${name}\n${clipboard}\nClick to copy`}
    >
      <div className={`text-center ${textColor}`}>
        <div className="text-[10px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100">
          {name.replace(/_/g, ' ')}
        </div>
        <div className="mt-0.5 text-[9px] font-mono opacity-60 group-hover:opacity-90">
          {display}
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

function PaletteSection({
  palette,
  colorFormat,
}: {
  palette: PaletteCategory;
  colorFormat: ColorFormat;
}) {
  const colors = Object.entries(palette.colors);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
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
        <PaletteDownload palette={palette} />
      </div>

      <div className="border-t border-border/30 px-6 py-4">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {colors.map(([name, def]) => (
            <ColorCard
              key={name}
              name={name}
              rgb={def.multiply}
              screen={def.screen}
              colorFormat={colorFormat}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CatColorPalettesPage() {
  const [colorFormat, setColorFormat] = useState<ColorFormat>('hex');

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
          description={`Browse ${ADDITIONAL_PALETTES.length} experimental color palettes with ${totalColors} unique colors for cat generation. Click any color to copy its ${colorFormat.toUpperCase()} value.`}
        />

        {/* Format selector + palette sections */}
        <div className="space-y-4">
          <div className="glass-card flex items-center gap-3 px-6 py-3">
            <span className="text-xs font-medium text-muted-foreground">Color format</span>
            <div className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
              {COLOR_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                    colorFormat === fmt
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setColorFormat(fmt)}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
          {ADDITIONAL_PALETTES.map((palette) => (
            <PaletteSection key={palette.id} palette={palette} colorFormat={colorFormat} />
          ))}
        </div>

        {/* Info footer */}
        <div className="mt-8 rounded-lg border border-border/30 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          <p>
            These colors are applied using multiply blend mode on WHITE base sprites. Colors with a
            small dot indicator also have a screen overlay for added depth.
          </p>
        </div>
      </div>
    </main>
  );
}
