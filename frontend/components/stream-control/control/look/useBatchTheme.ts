"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BATCH_THEME_META,
  BATCH_THEME_SETTING_KEY,
  type BatchThemeId,
  DEFAULT_BATCH_THEME,
  resolveBatchTheme,
} from "../../obs/themes/batchThemeMeta";
import { useFollowGuard } from "../useFollowGuard";

/**
 * The batch show look picked on the control page. Same contract as
 * `useOverlayTheme`: follows the session's `batchTheme`, writes with a
 * server-side merge, fresh local picks win over in-flight echoes.
 */
export function useBatchTheme(
  rawSessionSettings: Record<string, unknown> | null,
  syncSessionSettings: (updates: Record<string, unknown>) => void,
) {
  const [theme, setTheme] = useState<BatchThemeId>(DEFAULT_BATCH_THEME);
  const { touch, deferIfEditing, retryTick } = useFollowGuard();

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick re-runs the follow effect after a deferred edit
  useEffect(() => {
    if (!rawSessionSettings) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    setTheme(resolveBatchTheme(rawSessionSettings));
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  const pickTheme = useCallback(
    (id: BatchThemeId) => {
      if (id === theme) return;
      touch();
      setTheme(id);
      syncSessionSettings({ [BATCH_THEME_SETTING_KEY]: id });
      toast.success(`Batch show look: ${BATCH_THEME_META[id].label}`, {
        id: "batch-theme",
      });
    },
    [theme, touch, syncSessionSettings],
  );

  return { theme, setTheme: pickTheme };
}
