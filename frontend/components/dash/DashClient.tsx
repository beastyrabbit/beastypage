"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useVariants } from "@/utils/variants";
import { VariantBar } from "@/components/common/VariantBar";
import { TOOL_MAP } from "@/lib/dash/registry.generated";
import { APP_VERSION } from "@/lib/dash/version";
import { DEFAULT_DASH_SETTINGS, parseDashPayload, dashSettingsEqual } from "@/utils/dashVariants";
import type { DashSettings, ToolWidgetMeta } from "@/lib/dash/types";
import { DashHero } from "./DashHero";
import { WidgetGrid } from "./WidgetGrid";
import { AddWidgetModal } from "./AddWidgetModal";
import { ReleaseNotesModal } from "./ReleaseNotesModal";

export function DashClient() {
  const searchParams = useSearchParams();
  const slugParam = searchParams.get("slug");

  const variants = useVariants<DashSettings>({ storageKey: "dash.variants" });
  const { activeVariant, createVariant } = variants;

  // Local working copy of settings
  const [settings, setSettings] = useState<DashSettings>({ ...DEFAULT_DASH_SETTINGS });
  const [editing, setEditing] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const slugLoadedRef = useRef(false);

  // Sync settings from active variant
  useEffect(() => {
    if (activeVariant) {
      queueMicrotask(() => {
        setSettings(parseDashPayload(activeVariant.settings));
        setEditing(false);
      });
    }
  }, [activeVariant]);

  // Auto-enter edit mode when there are no widgets and no variant or slug pending
  useEffect(() => {
    if (!activeVariant && !slugParam && settings.widgets.length === 0) {
      queueMicrotask(() => setEditing(true));
    }
    // Only trigger on variant/slug changes, not on every settings mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVariant, slugParam]);

  // Load from slug query param
  useEffect(() => {
    if (!slugParam || slugLoadedRef.current) return;
    slugLoadedRef.current = true;
    let cancelled = false;
    fetch(`/api/dash-settings?slug=${encodeURIComponent(slugParam)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ config?: unknown }>;
      })
      .then((data) => {
        if (cancelled || !data.config) return;
        const imported = parseDashPayload(data.config);
        const v = createVariant(`Import ${slugParam.slice(0, 7)}`, imported);
        setSettings(v.settings);
        toast.success("Dashboard imported");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(`[DashClient] Failed to import dashboard slug="${slugParam}"`, error);
        toast.error("Failed to load shared dashboard");
      });
    return () => { cancelled = true; };
  }, [slugParam, createVariant]);

  // Resolve widget IDs to tool metadata
  const resolvedWidgets = useMemo(
    () => settings.widgets.map((id) => TOOL_MAP.get(id)).filter(Boolean) as ToolWidgetMeta[],
    [settings.widgets],
  );

  const placedIds = useMemo(() => new Set(settings.widgets), [settings.widgets]);

  // Version tracking
  const hasNewVersion =
    APP_VERSION !== "dev" &&
    settings.lastSeenVersion !== null &&
    settings.lastSeenVersion !== APP_VERSION;

  // Re-parse active variant settings once (memoized) to avoid repeated work during dirty checks
  const baseSettings = useMemo(
    () => (activeVariant ? parseDashPayload(activeVariant.settings) : DEFAULT_DASH_SETTINGS),
    [activeVariant],
  );
  const isDirty = !dashSettingsEqual(settings, baseSettings);

  // Widget actions
  const handleAddWidget = useCallback((id: string) => {
    setSettings((prev) => {
      if (prev.widgets.includes(id)) return prev;
      return { ...prev, widgets: [...prev.widgets, id] };
    });
  }, []);

  const handleRemoveWidget = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w !== id),
    }));
  }, []);

  const handleReorderWidgets = useCallback((widgetIds: string[]) => {
    setSettings((prev) => ({ ...prev, widgets: widgetIds }));
  }, []);

  const handleApplyConfig = useCallback((config: DashSettings) => {
    setSettings(parseDashPayload(config));
  }, []);

  const handleReleaseNotesClose = useCallback((latestTag: string | null) => {
    setReleaseNotesOpen(false);
    if (latestTag) {
      setSettings((prev) => ({ ...prev, lastSeenVersion: latestTag }));
    }
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    toast[type](message);
  }, []);

  const copyText = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch (err) {
      console.error("[DashClient] copyText failed", err);
      toast.error("Failed to copy");
    }
  }, []);

  const handleOpen = useCallback(async () => {
    setOpening(true);
    try {
      const response = await fetch("/api/dash-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ config: settings }),
      });
      if (!response.ok) throw new Error("Failed to export");
      const json = (await response.json()) as { slug?: string };
      const slug = json.slug?.trim();
      if (!slug) throw new Error("No slug returned");
      window.open(`/dash?slug=${slug}`, "_blank");
    } catch (error) {
      console.error("[DashClient] handleOpen", error);
      toast.error("Failed to generate share link");
    } finally {
      setOpening(false);
    }
  }, [settings]);

  return (
    <>
      <VariantBar
        variants={variants}
        snapshotConfig={settings}
        applyConfig={handleApplyConfig}
        isDirty={isDirty}
        showToast={showToast}
        copyText={copyText}
        apiPath="/api/dash-settings"
        parsePayload={parseDashPayload}
      />

      <DashHero
        version={APP_VERSION}
        hasNewVersion={hasNewVersion}
        onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
        editing={editing}
        onToggleEditing={() => setEditing((e) => !e)}
        hasVariant={!!activeVariant}
        opening={opening}
        onOpen={handleOpen}
      />

      {resolvedWidgets.length === 0 && !editing ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-muted-foreground">No tools pinned yet.</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/20"
          >
            Add your first tool
          </button>
        </div>
      ) : (
        <WidgetGrid
          widgets={resolvedWidgets}
          editing={editing}
          onAddClick={() => setAddModalOpen(true)}
          onRemove={handleRemoveWidget}
          onReorder={handleReorderWidgets}
        />
      )}

      <AddWidgetModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSelect={handleAddWidget}
        placedIds={placedIds}
      />

      <ReleaseNotesModal
        open={releaseNotesOpen}
        onClose={handleReleaseNotesClose}
      />
    </>
  );
}
