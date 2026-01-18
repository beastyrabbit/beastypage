'use client';

import { useState, useMemo } from 'react';
import { Search, Palette, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
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

function PaletteSection({
  palette,
  defaultExpanded = true,
}: {
  palette: PaletteCategory;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colors = Object.entries(palette.colors);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-muted/30"
      >
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
        {expanded ? (
          <ChevronUp className="size-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
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
      )}
    </div>
  );
}

export default function CatColorPalettesPage() {
  const [search, setSearch] = useState('');
  const [expandAll, setExpandAll] = useState(true);

  // Filter palettes by search
  const filteredPalettes = useMemo(() => {
    if (!search.trim()) return ADDITIONAL_PALETTES;
    const lower = search.toLowerCase();
    return ADDITIONAL_PALETTES.filter(
      (p) =>
        p.label.toLowerCase().includes(lower) ||
        p.description?.toLowerCase().includes(lower) ||
        Object.keys(p.colors).some((colorName) =>
          colorName.toLowerCase().includes(lower)
        )
    );
  }, [search]);

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

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search palettes or colors..."
              className="w-full rounded-lg border border-border/50 bg-background/70 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50"
            />
          </div>

          {/* Expand/Collapse All */}
          <button
            onClick={() => setExpandAll(!expandAll)}
            className="shrink-0 rounded-lg border border-border/50 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        {/* Palette sections */}
        <div className="space-y-4">
          {filteredPalettes.map((palette) => (
            <PaletteSection
              key={palette.id}
              palette={palette}
              defaultExpanded={expandAll}
            />
          ))}

          {filteredPalettes.length === 0 && (
            <div className="glass-card py-12 text-center">
              <Palette className="mx-auto size-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No palettes match &quot;{search}&quot;
              </p>
            </div>
          )}
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
