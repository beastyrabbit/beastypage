"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
  DEFAULT_SINGLE_CAT_SETTINGS,
  type SingleCatSettings,
} from "@/utils/singleCatVariants";
import { DEFAULT_TIMING_CONFIG } from "@/utils/spinTiming";

function resolveAutoClearSeconds(
  record: Record<string, unknown> | undefined,
): number {
  if (
    typeof record?.resultAutoClearSeconds === "number" &&
    record.resultAutoClearSeconds > 0
  ) {
    return record.resultAutoClearSeconds;
  }
  if (
    typeof record?.autoClearSeconds === "number" &&
    record.autoClearSeconds > 0
  ) {
    return record.autoClearSeconds;
  }
  return 30;
}

function resolveAutoClearEnabled(
  record: Record<string, unknown> | undefined,
  autoClearSeconds: number,
): boolean {
  if (typeof record?.resultAutoClearEnabled === "boolean") {
    return record.resultAutoClearEnabled;
  }
  if (typeof record?.autoClearEnabled === "boolean") {
    return record.autoClearEnabled;
  }
  return autoClearSeconds > 0;
}

/**
 * Subscribes to the stream session by API key and derives the overlay's
 * settings: the initial generator settings snapshot plus the resolved
 * result auto-clear configuration.
 */
export function useObsSession(apiKey: string) {
  const session = useQuery(api.catStream.getSessionByApiKey, { apiKey });
  const sessionSettingsRecord = session?.settings as
    | Record<string, unknown>
    | undefined;
  const sessionSettings = sessionSettingsRecord as
    | SingleCatSettings
    | undefined;

  // Derive settings from session (or defaults)
  const defaultMode = sessionSettings?.mode ?? "flashy";
  const defaultAccessoryRange = sessionSettings?.accessoryRange ?? {
    min: 1,
    max: 4,
  };
  const defaultScarRange = sessionSettings?.scarRange ?? { min: 1, max: 1 };
  const defaultTortieRange = sessionSettings?.tortieRange ?? { min: 1, max: 4 };
  const defaultAfterlife = sessionSettings?.afterlifeMode ?? "dark10";
  const initialVariantSettings = sessionSettings ?? null;

  const initialSettings = useMemo<SingleCatSettings>(() => {
    let base: SingleCatSettings;
    if (initialVariantSettings) {
      base = {
        ...DEFAULT_SINGLE_CAT_SETTINGS,
        ...initialVariantSettings,
        accessoryRange:
          initialVariantSettings.accessoryRange ??
          DEFAULT_SINGLE_CAT_SETTINGS.accessoryRange,
        scarRange:
          initialVariantSettings.scarRange ??
          DEFAULT_SINGLE_CAT_SETTINGS.scarRange,
        tortieRange:
          initialVariantSettings.tortieRange ??
          DEFAULT_SINGLE_CAT_SETTINGS.tortieRange,
        timing:
          initialVariantSettings.timing ?? DEFAULT_SINGLE_CAT_SETTINGS.timing,
      };
    } else {
      base = {
        ...DEFAULT_SINGLE_CAT_SETTINGS,
        mode: defaultMode,
        accessoryRange: { ...defaultAccessoryRange },
        scarRange: { ...defaultScarRange },
        tortieRange: { ...defaultTortieRange },
        afterlifeMode: defaultAfterlife,
        timing: {
          ...DEFAULT_TIMING_CONFIG,
          delays: { ...DEFAULT_TIMING_CONFIG.delays },
          subsetLimits: { ...DEFAULT_TIMING_CONFIG.subsetLimits },
          pauseDelays: DEFAULT_TIMING_CONFIG.pauseDelays
            ? {
                flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays.flashyMs,
                calmMs: DEFAULT_TIMING_CONFIG.pauseDelays.calmMs,
              }
            : undefined,
        },
      };
    }
    return base;
  }, [
    defaultAccessoryRange,
    defaultAfterlife,
    defaultMode,
    defaultScarRange,
    defaultTortieRange,
    initialVariantSettings,
  ]);

  const resolvedResultAutoClear = resolveAutoClearSeconds(
    sessionSettingsRecord,
  );
  const resolvedResultAutoClearEnabled = resolveAutoClearEnabled(
    sessionSettingsRecord,
    resolvedResultAutoClear,
  );

  return {
    session,
    sessionSettingsRecord,
    sessionSettings,
    initialSettings,
    resolvedResultAutoClear,
    resolvedResultAutoClearEnabled,
  };
}
