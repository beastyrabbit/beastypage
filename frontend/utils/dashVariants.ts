import { TOOL_MAP } from "@/lib/dash/registry.generated";
import type { DashSettings } from "@/lib/dash/types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_DASH_SETTINGS: DashSettings = {
  v: 1,
  widgets: [],
  lastSeenVersion: null,
};

// ---------------------------------------------------------------------------
// Payload parsing (Convex / import)
// ---------------------------------------------------------------------------

export function parseDashPayload(payload: unknown): DashSettings {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_DASH_SETTINGS };
  }
  const data = payload as Record<string, unknown>;

  if (data.v !== 1) {
    console.warn(`[parseDashPayload] Unsupported config version: ${String(data.v)}, falling back to defaults`);
    return { ...DEFAULT_DASH_SETTINGS };
  }

  const rawWidgets = Array.isArray(data.widgets) ? data.widgets : [];
  // Filter to known tool IDs and deduplicate
  const seen = new Set<string>();
  const widgets: string[] = [];
  for (const w of rawWidgets) {
    if (typeof w === "string" && TOOL_MAP.has(w) && !seen.has(w)) {
      seen.add(w);
      widgets.push(w);
    }
  }
  const droppedCount = rawWidgets.length - widgets.length;
  if (droppedCount > 0) {
    console.warn(`[parseDashPayload] Dropped ${droppedCount} unrecognized widget ID(s)`);
  }

  const lastSeenVersion =
    typeof data.lastSeenVersion === "string" ? data.lastSeenVersion : null;

  return { v: 1, widgets, lastSeenVersion };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function dashSettingsEqual(a: DashSettings, b: DashSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
