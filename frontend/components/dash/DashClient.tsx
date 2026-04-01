"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TOOL_MAP } from "@/lib/dash/registry.generated";
import { APP_VERSION } from "@/lib/dash/version";
import { DEFAULT_DASH_SETTINGS, parseDashPayload, dashSettingsEqual } from "@/utils/dashVariants";
import type { DashSettings, ToolWidgetMeta } from "@/lib/dash/types";
import { DashHero } from "./DashHero";
import { WidgetGrid } from "./WidgetGrid";
import { AddWidgetModal } from "./AddWidgetModal";
import { ReleaseNotesModal } from "./ReleaseNotesModal";

const DASH_VARIANT_ID = "dash-settings";

type DashClientProps = {
  initialSlug?: string | null;
  initialSettings?: DashSettings | null;
  initialLoadError?: string | null;
};

export function DashClient({
  initialSlug = null,
  initialSettings = null,
  initialLoadError = null,
}: DashClientProps = {}) {

  const { isAuthenticated } = useConvexAuth();

  // Load settings from Convex
  const convexVariants = useQuery(
    api.userVariants.list,
    isAuthenticated ? { toolKey: "dash" } : "skip"
  );
  const upsertVariant = useMutation(api.userVariants.upsert);

  // Local working copy of settings
  const [settings, setSettings] = useState<DashSettings>(() => (
    initialSettings ? parseDashPayload(initialSettings) : { ...DEFAULT_DASH_SETTINGS }
  ));
  const [editing, setEditing] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const initialLoadToastRef = useRef(false);
  const [loadedFromConvex, setLoadedFromConvex] = useState(false);

  useEffect(() => {
    if (initialLoadToastRef.current) return;
    if (!initialSlug) return;
    initialLoadToastRef.current = true;
    if (initialLoadError) {
      toast.error(initialLoadError);
      return;
    }
    if (initialSettings) {
      toast.success("Dashboard loaded");
    }
  }, [initialLoadError, initialSettings, initialSlug]);

  // Load settings from Convex once available
  useEffect(() => {
    if (loadedFromConvex || initialSlug) return;
    if (!convexVariants) return;
    const saved = convexVariants.find((v) => v.variantId === DASH_VARIANT_ID);
    if (saved) {
      setSettings(parseDashPayload(saved.settings));
    }
    setLoadedFromConvex(true);
  }, [convexVariants, initialSlug, loadedFromConvex]);

  // Save settings to Convex on change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isAuthenticated || !loadedFromConvex) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void upsertVariant({
        toolKey: "dash",
        variantId: DASH_VARIANT_ID,
        name: "Dashboard",
        settings: settings as unknown as Record<string, unknown>,
        isActive: true,
      }).catch((err) => {
        console.error("[Dash] save failed:", err);
        toast.error("Failed to save dashboard");
      });
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings, isAuthenticated, upsertVariant, loadedFromConvex]);

  // Auto-enter edit mode when there are no widgets and no slug pending
  useEffect(() => {
    if (!initialSlug && settings.widgets.length === 0 && loadedFromConvex) {
      queueMicrotask(() => setEditing(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug, loadedFromConvex]);

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

  const handleReleaseNotesClose = useCallback((latestTag: string | null) => {
    setReleaseNotesOpen(false);
    if (latestTag) {
      setSettings((prev) => ({ ...prev, lastSeenVersion: latestTag }));
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
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      const json = (await response.json()) as { slug?: string };
      const slug = json.slug?.trim();
      if (!slug) throw new Error("No slug returned");
      window.open(`/dash?slug=${encodeURIComponent(slug)}`, "_blank");
    } catch (error) {
      console.error("[DashClient] handleOpen", error);
      toast.error("Failed to generate share link");
    } finally {
      setOpening(false);
    }
  }, [settings]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Sign in to access your dashboard.</p>
      </div>
    );
  }

  return (
    <>
      <DashHero
        version={APP_VERSION}
        hasNewVersion={hasNewVersion}
        onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
        editing={editing}
        onToggleEditing={() => setEditing((e) => !e)}
        hasVariant={false}
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
