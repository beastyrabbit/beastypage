"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { ColorPaletteClient } from "./ColorPaletteClient";

const EXPORT_SIZE = 700;

export function ColorPaletteContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const darkForestParam = searchParams.get("darkForest");
  const imageUrl = searchParams.get("imageUrl");

  const [initialImage, setInitialImage] = useState<string | null>(null);
  const [generatorReady, setGeneratorReady] = useState(false);
  const generatorRef = useRef<CatGeneratorApi | null>(null);

  // Load cat data from Convex if slug is provided
  const mapperRecord = useQuery(
    api.mapper.getBySlug,
    slug ? { slugOrId: slug } : "skip"
  );

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

  // Render sprite when cat data and generator are ready
  useEffect(() => {
    if (!slug || !mapperRecord?.cat_data?.params || !generatorReady) return;
    if (initialImage) return;

    const generator = generatorRef.current;
    if (!generator) return;

    let cancelled = false;

    (async () => {
      try {
        // Respect dark forest override from query param
        let params = mapperRecord.cat_data!.params;
        if (darkForestParam === "false" && params.darkForest) {
          params = { ...params, darkForest: false, darkMode: false };
        }

        const result = await generator.generateCat(params);

        // Create export canvas at desired size
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = EXPORT_SIZE;
        exportCanvas.height = EXPORT_SIZE;
        const ctx = exportCanvas.getContext("2d");
        if (!ctx || cancelled) return;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

        const dataUrl = exportCanvas.toDataURL("image/png");
        if (!cancelled) {
          setInitialImage(dataUrl);
        }
      } catch (err) {
        console.error("Failed to render cat sprite", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, mapperRecord, darkForestParam, generatorReady, initialImage]);

  // Handle direct image URL (for regular uploads)
  useEffect(() => {
    if (imageUrl && !slug) {
      setInitialImage(imageUrl);
    }
  }, [imageUrl, slug]);

  // Show loading state while rendering sprite
  if (slug && !initialImage) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {mapperRecord === undefined ? "Loading cat data..." : "Rendering sprite..."}
      </div>
    );
  }

  return <ColorPaletteClient initialImageUrl={initialImage} />;
}
