import { useEffect, useState } from "react";

import type { BuilderOptions, CatGeneratorApi, SpriteMapperApi } from "./types";
import { FORBIDDEN_SPRITES } from "./types";

export function useSpriteMapperOptions() {
  const [mapper, setMapper] = useState<SpriteMapperApi | null>(null);
  const [options, setOptions] = useState<BuilderOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [{ default: spriteMapper }] = await Promise.all([
          import("@/lib/single-cat/spriteMapper") as Promise<{ default: SpriteMapperApi }>,
        ]);
        if (cancelled) return;

        if (!spriteMapper.loaded) {
          await spriteMapper.init();
        }
        if (cancelled) return;

        setMapper(spriteMapper);

        const spriteNumbers = spriteMapper.getSprites().filter((value) => !FORBIDDEN_SPRITES.has(value));
        const builderOptions: BuilderOptions = {
          sprites: spriteNumbers,
          pelts: spriteMapper.getPeltNames(),
          points: spriteMapper.getPoints(),
          vitiligo: spriteMapper.getVitiligo(),
          whitePatches: spriteMapper.getWhitePatches(),
          eyeColours: spriteMapper.getEyeColours(),
          skinColours: spriteMapper.getSkinColours(),
          tints: spriteMapper.getTints(),
          whiteTints: ["none", ...spriteMapper.getWhiteTints().filter((entry) => entry !== "none")],
          tortieMasks: spriteMapper.getTortieMasks(),
          plantAccessories: spriteMapper.getPlantAccessories(),
          wildAccessories: spriteMapper.getWildAccessories(),
          collarAccessories: spriteMapper.getCollars(),
          scarBattle: spriteMapper.getScarsByCategory(1),
          scarMissing: spriteMapper.getScarsByCategory(2),
          scarEnvironmental: spriteMapper.getScarsByCategory(3),
        };

        if (cancelled) return;
        setOptions(builderOptions);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load sprite mapper options", err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { mapper, options, loading, error };
}

export function useCatGenerator() {
  const [generator, setGenerator] = useState<CatGeneratorApi | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: catGenerator } = (await import("@/lib/single-cat/catGeneratorV3")) as {
          default: CatGeneratorApi;
        };
        if (cancelled) return;
        setGenerator(catGenerator);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load cat generator", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { generator, ready, error };
}
