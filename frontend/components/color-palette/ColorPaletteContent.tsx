"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import DownChevron from "@/components/ui/down-chevron";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { ColorPaletteClient } from "./ColorPaletteClient";

const EXPORT_SIZE = 700;
// Exclude forbidden sprites (see FORBIDDEN_SPRITES in cat-builder/types.ts: 0, 1, 2, 3, 4, 19, 20)
const VALID_SPRITES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
const GRID_COLS = 5;
const GRID_ROWS = 3;
const SPRITE_SIZE = 50;
const ALL_SPRITES_SIZE = GRID_COLS * SPRITE_SIZE;

type SpriteSelection = number | "all";

type ColorPaletteContentProps = {
  slug?: string | null;
  darkForestParam?: string | null;
  imageUrl?: string | null;
  paletteSlug?: string | null;
};

export function ColorPaletteContent({
  slug = null,
  darkForestParam = null,
  imageUrl = null,
  paletteSlug = null,
}: ColorPaletteContentProps = {}) {

  const [initialImage, setInitialImage] = useState<string | null>(null);
  const [generatorReady, setGeneratorReady] = useState(false);
  const [selectedSprite, setSelectedSprite] = useState<SpriteSelection>(8);
  const [isRendering, setIsRendering] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load cat data from Convex if slug is provided
  const mapperRecord = useQuery(
    api.mapper.getBySlug,
    slug ? { slugOrId: slug } : "skip"
  );

  // Load palette config from Convex if paletteSlug is provided
  const paletteRecord = useQuery(
    api.paletteGeneratorSettings.get,
    paletteSlug ? { slug: paletteSlug } : "skip"
  );

  // Get image download URL from Convex storage for palette slug
  const paletteConfig = paletteRecord?.config as
    | { source: string; imageStorageId: string; colors: unknown[] }
    | undefined;
  const paletteImageUrl = useQuery(
    api.paletteGeneratorSettings.getImageUrl,
    paletteConfig?.imageStorageId
      ? { storageId: paletteConfig.imageStorageId as Id<"_storage"> }
      : "skip"
  );

  // Compute cat params with dark forest override
  // Handles both wrapped format ({ params: {...} }) and flat format (pre-v4.2.3 Discord cats)
  const catParams = useMemo(() => {
    if (!mapperRecord?.cat_data) return null;
    const data = mapperRecord.cat_data as Record<string, unknown>;
    let params: Record<string, unknown>;
    if (data.params && typeof data.params === "object") {
      params = data.params as Record<string, unknown>;
    } else if (data.spriteNumber !== undefined) {
      // Flat format — the entire catData IS the params
      params = data;
    } else {
      return null;
    }
    if (darkForestParam === "false" && params.darkForest) {
      params = { ...params, darkForest: false, darkMode: false };
    }
    return params;
  }, [mapperRecord, darkForestParam]);

  // Load cat generator module
  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    (async () => {
      try {
        const { default: catGenerator } = await import("@/lib/single-cat/catGeneratorV3");
        if (!cancelled) {
          generatorRef.current = catGenerator as CatGeneratorApi;
          setGeneratorReady(true);
        }
      } catch (err) {
        console.error("Failed to load cat generator", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Render function for a single sprite
  const renderSingleSprite = useCallback(async (
    generator: CatGeneratorApi,
    params: Record<string, unknown>,
    spriteNumber: number,
    size: number
  ): Promise<HTMLCanvasElement> => {
    const result = await generator.generateCat({ ...params, spriteNumber });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, size, size);
    return canvas;
  }, []);

  // Render all sprites in a grid
  const renderAllSprites = useCallback(async (
    generator: CatGeneratorApi,
    params: Record<string, unknown>
  ): Promise<string> => {
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = ALL_SPRITES_SIZE;
    gridCanvas.height = GRID_ROWS * SPRITE_SIZE;
    const ctx = gridCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < VALID_SPRITES.length; i++) {
      const spriteNumber = VALID_SPRITES[i];
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);

      try {
        const spriteCanvas = await renderSingleSprite(generator, params, spriteNumber, SPRITE_SIZE);
        ctx.drawImage(spriteCanvas, col * SPRITE_SIZE, row * SPRITE_SIZE);
      } catch (err) {
        console.warn(`Failed to render sprite ${spriteNumber}`, err);
      }
    }

    return gridCanvas.toDataURL("image/png");
  }, [renderSingleSprite]);

  // Render sprite(s) when selection changes or params are ready
  useEffect(() => {
    if (!slug || !generatorReady || !catParams) return;

    const generator = generatorRef.current;
    if (!generator) return;

    let cancelled = false;
    setIsRendering(true);
    setInitialImage(null); // Clear previous image while rendering

    (async () => {
      try {
        let dataUrl: string;

        if (selectedSprite === "all") {
          dataUrl = await renderAllSprites(generator, catParams);
        } else {
          const canvas = await renderSingleSprite(generator, catParams, selectedSprite, EXPORT_SIZE);
          dataUrl = canvas.toDataURL("image/png");
        }

        if (!cancelled) {
          setInitialImage(dataUrl);
        }
      } catch (err) {
        console.error("Failed to render cat sprite", err);
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, generatorReady, catParams, selectedSprite, renderSingleSprite, renderAllSprites]);

  // Handle direct image URL (for regular uploads)
  useEffect(() => {
    if (imageUrl && !slug && !paletteSlug) {
      setInitialImage(imageUrl);
    }
  }, [imageUrl, slug, paletteSlug]);

  // Handle palette slug — load image from Convex storage
  useEffect(() => {
    if (paletteSlug && paletteImageUrl) {
      setInitialImage(paletteImageUrl);
    }
  }, [paletteSlug, paletteImageUrl]);

  // Handle dropdown open with position calculation
  const handleDropdownToggle = useCallback(() => {
    if (!dropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setDropdownOpen(!dropdownOpen);
  }, [dropdownOpen]);

  // Close dropdown on click outside, scroll, resize, or Escape key
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };

    const handleClose = () => setDropdownOpen(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [dropdownOpen]);

  // Sprite selector component (only shown when using slug)
  const spriteSelector = slug ? (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleDropdownToggle}
        disabled={isRendering}
        className="flex items-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-foreground/30 disabled:opacity-50"
      >
        <span>
          {selectedSprite === "all" ? "All Sprites" : `Sprite ${selectedSprite}`}
        </span>
        <DownChevron size={16} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
      </button>

      {dropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed max-h-64 w-48 overflow-y-auto rounded-xl border border-border/50 bg-background/95 py-1 shadow-lg backdrop-blur-sm"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedSprite("all");
              setDropdownOpen(false);
            }}
            className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-foreground/10 ${
              selectedSprite === "all" ? "bg-primary/20 text-primary" : "text-foreground"
            }`}
          >
            All Sprites (Grid)
          </button>
          <div className="mx-2 my-1 border-t border-border/30" />
          {VALID_SPRITES.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                setSelectedSprite(num);
                setDropdownOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-foreground/10 ${
                selectedSprite === num ? "bg-primary/20 text-primary" : "text-foreground"
              }`}
            >
              Sprite {num}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  ) : null;

  // Show loading state while rendering sprite or loading palette
  if (slug && !initialImage) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {mapperRecord === undefined ? "Loading cat data..." : "Rendering sprite..."}
      </div>
    );
  }
  if (paletteSlug && !initialImage) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {paletteRecord === undefined ? "Loading palette..." : "Loading image..."}
      </div>
    );
  }

  return (
    <ColorPaletteClient
      initialImageUrl={initialImage}
      toolbarLeft={spriteSelector}
      isExternalLoading={isRendering}
    />
  );
}
