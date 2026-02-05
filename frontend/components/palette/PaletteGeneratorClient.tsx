"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { PageHero } from "@/components/common/PageHero";
import { VariantBar } from "@/components/common/VariantBar";
import { useVariants } from "@/utils/variants";
import {
  parsePaletteGeneratorPayload,
  paletteGeneratorSettingsEqual,
  DEFAULT_PALETTE_GENERATOR_SETTINGS,
  type PaletteGeneratorSettings,
} from "@/utils/paletteGeneratorVariants";
import { type DisplayFormat, type GeneratedPalette } from "@/lib/palette-generator/types";
import { fetchPaletteFromAPI } from "@/lib/palette-generator/api";
import SparklesIcon from "@/components/ui/sparkles-icon";
import { GeneratorControls } from "./GeneratorControls";
import { CollectionActionBar } from "./CollectionActionBar";
import { PaletteCard } from "./PaletteCard";
import { track } from "@/lib/analytics";

const COLLECTION_KEY = "paletteGenerator.collection";

function loadCollection(): GeneratedPalette[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("[PaletteGenerator] Stored collection is not an array, resetting");
      return [];
    }
    return parsed;
  } catch (error) {
    console.error("[PaletteGenerator] Failed to load saved collection from localStorage", error);
    return [];
  }
}

export function PaletteGeneratorClient() {
  // -------------------------------------------------------------------------
  // Config state
  // -------------------------------------------------------------------------
  const [paletteSize, setPaletteSize] = useState(DEFAULT_PALETTE_GENERATOR_SETTINGS.paletteSize);
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>(
    DEFAULT_PALETTE_GENERATOR_SETTINGS.displayFormat,
  );

  // -------------------------------------------------------------------------
  // Collection state
  // -------------------------------------------------------------------------
  const [collection, setCollection] = useState<GeneratedPalette[]>([]);
  const collectionInitialized = useRef(false);

  useEffect(() => {
    if (collectionInitialized.current) return;
    collectionInitialized.current = true;
    setCollection(loadCollection());
  }, []);

  // -------------------------------------------------------------------------
  // Variant system
  // -------------------------------------------------------------------------
  const variants = useVariants<PaletteGeneratorSettings>({
    storageKey: "paletteGenerator.variants",
  });

  // Persist collection to standalone localStorage only when no variant is active.
  // When a variant is active, collection is saved as part of the variant on manual save.
  useEffect(() => {
    if (!collectionInitialized.current) return;
    if (variants.activeVariant) return;
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
    } catch (error) {
      console.error("[PaletteGenerator] Failed to persist palette collection", error);
      toast.error("Could not save collection locally. Consider exporting before leaving.");
    }
  }, [collection, variants.activeVariant]);

  const snapshotConfig = useMemo(
    (): PaletteGeneratorSettings => ({
      v: 1,
      paletteSize,
      displayFormat,
      collection,
    }),
    [paletteSize, displayFormat, collection],
  );

  const applyConfig = useCallback((s: PaletteGeneratorSettings) => {
    const safe = parsePaletteGeneratorPayload(s);
    setPaletteSize(safe.paletteSize);
    setDisplayFormat(safe.displayFormat);
    setCollection(safe.collection);
  }, []);

  const isDirty = useMemo(() => {
    if (!variants.activeVariant) return false;
    const parsed = parsePaletteGeneratorPayload(variants.activeVariant.settings);
    return !paletteGeneratorSettingsEqual(snapshotConfig, parsed);
  }, [snapshotConfig, variants.activeVariant]);

  // Apply variant on first load
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current) return;
    if (variants.activeVariant) {
      appliedInitial.current = true;
      applyConfig(variants.activeVariant.settings);
    }
  }, [variants.activeVariant, applyConfig]);

  // -------------------------------------------------------------------------
  // Toast / clipboard helpers
  // -------------------------------------------------------------------------
  const showToast = useCallback((message: string) => {
    toast.success(message);
  }, []);

  const copyText = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch (error) {
      console.error("[PaletteGenerator] Clipboard write failed", error);
      toast.error("Clipboard unavailable");
    }
  }, []);

  // -------------------------------------------------------------------------
  // Generation logic
  // -------------------------------------------------------------------------
  const [generatingMode, setGeneratingMode] = useState<string | null>(null);

  const handleGenerate = useCallback(
    async (mode: string) => {
      setGeneratingMode(mode);
      try {
        const palette = await fetchPaletteFromAPI(mode, paletteSize);
        if (palette.source === "fallback") {
          toast.warning("Color API unavailable — showing a placeholder palette");
        }
        setCollection((prev) => [palette, ...prev]);
        track("palette_generator_generated", { mode, count: paletteSize, source: palette.source });
      } catch (error) {
        console.error("[PaletteGenerator] Generation failed", error);
        toast.error("Failed to generate palette. Please try again.");
      } finally {
        setGeneratingMode(null);
      }
    },
    [paletteSize],
  );

  // -------------------------------------------------------------------------
  // Collection actions
  // -------------------------------------------------------------------------
  const handleRemove = useCallback((id: string) => {
    setCollection((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdateColor = useCallback((paletteId: string, colorIndex: number, newHex: string) => {
    setCollection((prev) =>
      prev.map((p) => {
        if (p.id !== paletteId) return p;
        const colors = [...p.colors];
        colors[colorIndex] = newHex;
        return { ...p, colors };
      }),
    );
  }, []);

  const handleClear = useCallback(() => {
    setCollection([]);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Artist Tools"
        title="Palette Generator"
        description="Generate harmonious color palettes instantly. Pick a harmony mode to generate, adjust size, and build your collection."
      />

      <VariantBar<PaletteGeneratorSettings>
        variants={variants}
        snapshotConfig={snapshotConfig}
        applyConfig={applyConfig}
        isDirty={isDirty}
        showToast={showToast}
        copyText={copyText}
        apiPath="/api/palette-generator-settings"
        parsePayload={parsePaletteGeneratorPayload}
      />

      <GeneratorControls
        paletteSize={paletteSize}
        onPaletteSizeChange={setPaletteSize}
        displayFormat={displayFormat}
        onFormatChange={setDisplayFormat}
        onGenerate={handleGenerate}
        generatingMode={generatingMode}
      />

      <CollectionActionBar
        palettes={collection}
        displayFormat={displayFormat}
        onClear={handleClear}
        showToast={showToast}
      />

      {/* Palette collection */}
      <div className="flex flex-col gap-2.5">
        <AnimatePresence mode="popLayout">
          {collection.map((palette) => (
            <PaletteCard
              key={palette.id}
              palette={palette}
              displayFormat={displayFormat}
              onRemove={handleRemove}
              onUpdateColor={handleUpdateColor}
              showToast={showToast}
            />
          ))}
        </AnimatePresence>

        {collection.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] py-20 text-center">
            <div className="mb-4 text-muted-foreground/20">
              <SparklesIcon size={48} />
            </div>
            <p className="text-sm text-muted-foreground/40">
              Pick a <strong className="text-muted-foreground/60">harmony mode</strong> above to generate your first palette
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
