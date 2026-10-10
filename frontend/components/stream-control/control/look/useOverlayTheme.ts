"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_THEME_META,
  OVERLAY_THEME_SETTING_KEY,
  type OverlayThemeId,
  resolveOverlayTheme,
} from "../../obs/themes/themeMeta";
import { useFollowGuard } from "../useFollowGuard";

/**
 * The overlay theme picked on the control page. Follows the session's
 * `overlayTheme` (so a second control tab or a reload shows the live value)
 * and writes changes with a server-side merge. Fresh local picks win over
 * in-flight echoes (useFollowGuard).
 */
export function useOverlayTheme(
  rawSessionSettings: Record<string, unknown> | null,
  syncSessionSettings: (updates: Record<string, unknown>) => void,
) {
  const [theme, setLocal] = useState<OverlayThemeId>(DEFAULT_OVERLAY_THEME);
  const { touch, deferIfEditing, retryTick } = useFollowGuard();

  useEffect(() => {
    void retryTick;
    if (!rawSessionSettings) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    setLocal(resolveOverlayTheme(rawSessionSettings));
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  const setTheme = useCallback(
    (id: OverlayThemeId) => {
      if (id === theme) return;
      touch();
      setLocal(id);
      syncSessionSettings({ [OVERLAY_THEME_SETTING_KEY]: id });
      // Shared id: quick arrow-key browsing updates one toast instead of stacking.
      toast.success(`Overlay theme: ${OVERLAY_THEME_META[id].label}`, {
        id: "overlay-theme",
      });
    },
    [theme, touch, syncSessionSettings],
  );

  return { theme, setTheme };
}
