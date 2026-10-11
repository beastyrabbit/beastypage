"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_SHOW_LOOK,
  resolveShowLook,
  SHOW_LOOK_META,
  SHOW_LOOK_SETTING_KEY,
  type ShowLookId,
} from "../../obs/looks/lookMeta";
import { useFollowGuard } from "../useFollowGuard";

/**
 * The evolution look picked on the control page. Follows the
 * session's `showLook` (so a second control tab or a reload shows the live
 * value) and writes changes with a server-side merge. Fresh local picks win
 * over in-flight echoes (useFollowGuard).
 */
export function useShowLook(
  rawSessionSettings: Record<string, unknown> | null,
  syncSessionSettings: (updates: Record<string, unknown>) => void,
) {
  const [look, setLook] = useState<ShowLookId>(DEFAULT_SHOW_LOOK);
  const { touch, deferIfEditing, retryTick } = useFollowGuard();

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick re-runs the follow effect after a deferred edit
  useEffect(() => {
    if (!rawSessionSettings) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    setLook(resolveShowLook(rawSessionSettings));
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  const pickLook = useCallback(
    (id: ShowLookId) => {
      if (id === look) return;
      touch();
      setLook(id);
      syncSessionSettings({ [SHOW_LOOK_SETTING_KEY]: id });
      toast.success(`Evolution look: ${SHOW_LOOK_META[id].label}`, {
        id: "show-look",
      });
    },
    [look, touch, syncSessionSettings],
  );

  return { look, setLook: pickLook };
}
