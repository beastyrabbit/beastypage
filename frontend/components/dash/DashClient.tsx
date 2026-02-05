"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useVariants } from "@/utils/variants";
import { VariantBar } from "@/components/common/VariantBar";
import { TOOL_MAP } from "@/lib/dash/registry.generated";
import { APP_VERSION } from "@/lib/dash/version";
import { DEFAULT_DASH_SETTINGS, parseDashPayload, dashSettingsEqual } from "@/utils/dashVariants";
import type { DashSettings } from "@/lib/dash/types";
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
  const [slugLoaded, setSlugLoaded] = useState(false);

  // Sync settings from active variant
  useEffect(() => {
    if (activeVariant) {
      setSettings(parseDashPayload(activeVariant.settings));
    }
  }, [activeVariant]);

  // Load from slug query param
  useEffect(() => {
    if (!slugParam || slugLoaded) return;
    setSlugLoaded(true);
    fetch(`/api/dash-settings?slug=${encodeURIComponent(slugParam)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ config?: unknown }>;
      })
      .then((data) => {
        if (!data.config) return;
        const imported = parseDashPayload(data.config);
        const v = createVariant(`Import ${slugParam.slice(0, 7)}`, imported);
        setSettings(v.settings);
        toast.success("Dashboard imported");
      })
      .catch(() => {
        toast.error("Failed to load shared dashboard");
      });
  }, [slugParam, slugLoaded, createVariant]);

  // Auto-enter edit mode when no widgets are placed and no variant is active
  useEffect(() => {
    if (!activeVariant && settings.widgets.length === 0 && !slugParam) {
      queueMicrotask(() => setEditing(true));
    }
  }, [activeVariant, settings.widgets.length, slugParam]);

  // Resolve widget IDs to tool metadata
  const resolvedWidgets = useMemo(
    () => settings.widgets.map((id) => TOOL_MAP.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof TOOL_MAP.get>>[],
    [settings.widgets],
  );

  const placedIds = useMemo(() => new Set(settings.widgets), [settings.widgets]);

  // Version tracking
  const hasNewVersion =
    APP_VERSION !== "dev" &&
    settings.lastSeenVersion !== null &&
    settings.lastSeenVersion !== APP_VERSION;

  // Dirty detection
  const isDirty = activeVariant
    ? !dashSettingsEqual(settings, parseDashPayload(activeVariant.settings))
    : !dashSettingsEqual(settings, DEFAULT_DASH_SETTINGS);

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

  const handleApplyConfig = useCallback((config: DashSettings) => {
    setSettings(parseDashPayload(config));
  }, []);

  const handleReleaseNotesClose = useCallback((latestTag: string | null) => {
    setReleaseNotesOpen(false);
    if (latestTag) {
      setSettings((prev) => ({ ...prev, lastSeenVersion: latestTag }));
    }
  }, []);

  const showToast = useCallback((message: string) => {
    toast.success(message);
  }, []);

  const copyText = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

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
