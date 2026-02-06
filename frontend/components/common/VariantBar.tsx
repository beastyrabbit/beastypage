"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseVariantsReturn } from "@/utils/variants";

interface VariantBarProps<T> {
  variants: UseVariantsReturn<T>;
  snapshotConfig: T;
  applyConfig: (settings: T) => void;
  isDirty: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
  copyText: (text: string, successMessage: string) => Promise<void>;
  apiPath: string;
  parsePayload: (payload: unknown) => T;
  /** When set, shows a "Copy Link" button after export that copies `shareBaseUrl?slug=<slug>` */
  shareBaseUrl?: string;
}

export function VariantBar<T>({
  variants,
  snapshotConfig,
  applyConfig,
  isDirty,
  showToast,
  copyText,
  apiPath,
  parsePayload,
  shareBaseUrl,
}: VariantBarProps<T>) {
  const { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive, setVariantSlug } = variants;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Manage popup state
  const [manageOpen, setManageOpen] = useState(false);
  const [importSlug, setImportSlug] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastExportedSlug, setLastExportedSlug] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Reset manage popup state when closed
  useEffect(() => {
    if (!manageOpen) {
      setLastExportedSlug(null);
      setImportSlug("");
      setConfirmingDelete(false);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    }
  }, [manageOpen]);

  // Clean up confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // DB sync
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const syncToDb = useCallback(async (config: T, existingSlug?: string) => {
    const response = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ config, ...(existingSlug ? { slug: existingSlug } : {}) }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Sync failed (HTTP ${response.status})`);
    }
    const json = (await response.json()) as { slug?: string; updated?: boolean };
    const slug = json.slug?.trim();
    if (!slug) throw new Error("No slug returned");
    return { slug, updated: !!json.updated };
  }, [apiPath]);

  const handleSelectVariant = useCallback(
    (id: string | null) => {
      setDropdownOpen(false);
      if (id === null) {
        setActive(null);
        return;
      }
      const variant = store.variants.find((v) => v.id === id);
      if (variant) {
        setActive(id);
        applyConfig(variant.settings);
      }
    },
    [store.variants, setActive, applyConfig],
  );

  const handleNew = useCallback(async () => {
    const name = `Variant ${store.variants.length + 1}`;
    const variant = createVariant(name, snapshotConfig);
    showToast("Variant created");

    setSyncingIds((prev) => new Set(prev).add(variant.id));
    try {
      const result = await syncToDb(snapshotConfig);
      setVariantSlug(variant.id, result.slug);
    } catch (error) {
      console.error("[VariantBar] handleNew DB sync failed", error);
      showToast("Sync failed — saved locally only", "error");
    } finally {
      setSyncingIds((prev) => { const next = new Set(prev); next.delete(variant.id); return next; });
    }
  }, [store.variants.length, snapshotConfig, createVariant, showToast, syncToDb, setVariantSlug]);

  const handleSave = useCallback(async () => {
    saveToActive(snapshotConfig);
    showToast("Variant saved");

    if (!activeVariant) return;
    const { id: variantId, slug: existingSlug } = activeVariant;

    setSyncingIds((prev) => new Set(prev).add(variantId));
    try {
      const result = await syncToDb(snapshotConfig, existingSlug);
      if (!existingSlug) setVariantSlug(variantId, result.slug);
    } catch (error) {
      console.error("[VariantBar] handleSave DB sync failed", error);
      showToast("Saved locally, but cloud sync failed", "error");
    } finally {
      setSyncingIds((prev) => { const next = new Set(prev); next.delete(variantId); return next; });
    }
  }, [snapshotConfig, saveToActive, showToast, activeVariant, syncToDb, setVariantSlug]);

  const startRename = useCallback(() => {
    if (!activeVariant) return;
    setRenameValue(activeVariant.name);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [activeVariant]);

  const commitRename = useCallback(() => {
    if (!activeVariant) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== activeVariant.name) {
      renameVariant(activeVariant.id, trimmed);
    }
    setRenaming(false);
  }, [activeVariant, renameValue, renameVariant]);

  const handleExport = useCallback(async () => {
    if (activeVariant?.slug) {
      setLastExportedSlug(activeVariant.slug);
      showToast("Share slug ready");
      return;
    }
    // Fallback: POST to get a slug (no-variant mode or legacy)
    setExporting(true);
    try {
      const result = await syncToDb(snapshotConfig);
      setLastExportedSlug(result.slug);
      if (activeVariant) setVariantSlug(activeVariant.id, result.slug);
      showToast("Exported successfully");
    } catch (error) {
      console.error("[VariantBar] handleExport failed", error);
      showToast(error instanceof Error ? error.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }, [activeVariant, snapshotConfig, syncToDb, showToast, setVariantSlug]);

  const handleImport = useCallback(async () => {
    const normalized = importSlug.trim();
    if (!normalized) {
      showToast("Enter a slug to import", "error");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch(
        `${apiPath}?slug=${encodeURIComponent(normalized)}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) {
        console.warn(`handleImport: server returned ${response.status} for slug "${normalized}"`);
        showToast(response.status === 404 ? "Slug not found" : "Failed to load", "error");
        return;
      }
      const json = (await response.json()) as { config?: unknown };
      if (!json.config) {
        showToast("Invalid config", "error");
        return;
      }
      const settings = parsePayload(json.config);
      const variant = createVariant(`Import ${normalized.slice(0, 7)}`, settings);
      applyConfig(variant.settings);
      setImportSlug("");
      showToast("Variant imported");
      setManageOpen(false);
    } catch (error) {
      console.error("handleImport", error);
      showToast(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }, [apiPath, importSlug, parsePayload, createVariant, applyConfig, showToast]);

  const handleDelete = useCallback(() => {
    if (!activeVariant) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
        confirmTimerRef.current = null;
      }, 3000);
      return;
    }
    // Second click — confirmed
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    deleteVariant(activeVariant.id);
    showToast("Variant deleted");
    setManageOpen(false);
  }, [activeVariant, confirmingDelete, deleteVariant, showToast]);

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <div className="relative z-30 rounded-2xl border border-border/40 bg-background/60 backdrop-blur px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className={cn(buttonClass, "min-w-[140px] justify-between")}
            >
              <span className="truncate">
                {activeVariant ? activeVariant.name : "No variant"}
              </span>
              <svg className="size-3 shrink-0 opacity-60" viewBox="0 0 12 12" fill="none">
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border/50 bg-background/95 py-1 shadow-xl backdrop-blur">
                <button
                  type="button"
                  onClick={() => handleSelectVariant(null)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs transition hover:bg-foreground/10",
                    !activeVariant && "font-semibold text-foreground",
                  )}
                >
                  No variant (defaults)
                </button>
                {store.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectVariant(v.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs transition hover:bg-foreground/10",
                      v.id === store.activeId && "font-semibold text-foreground",
                    )}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active variant name / rename + dirty indicator */}
          {activeVariant && (
            <div className="flex items-center gap-1.5">
              {renaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="w-32 rounded-lg border border-border/50 bg-background/80 px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={startRename}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                  title="Click to rename"
                >
                  {activeVariant.name}
                </button>
              )}
              {syncingIds.has(activeVariant.id) && (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              )}
              {isDirty && (
                <span className="size-2 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
            </div>
          )}

          {activeVariant && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              className={buttonClass}
            >
              Save
            </button>
          )}

          <button type="button" onClick={handleNew} className={buttonClass}>
            + New
          </button>

          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className={buttonClass}
          >
            Manage
          </button>
        </div>
      </div>

      {/* Manage popup overlay */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManageOpen(false);
          }}
        >
          <div
            className="relative mx-4 w-full max-w-md rounded-3xl border border-border/40 bg-background/95 p-6 shadow-2xl backdrop-blur"
          >
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition"
            >
              <X className="size-4" />
            </button>

            <h2 className="mb-5 text-sm font-semibold text-foreground">Manage Variants</h2>

            {/* Share / Export */}
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Share</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className={buttonClass}
                >
                  {exporting && <Loader2 className="size-3 animate-spin" />}
                  Export
                </button>
                {lastExportedSlug && (
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={lastExportedSlug}
                      className="flex-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-xs text-foreground font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(lastExportedSlug, "Slug copied to clipboard")}
                      className={buttonClass}
                    >
                      Copy
                    </button>
                    {shareBaseUrl && (
                      <button
                        type="button"
                        onClick={() => copyText(`${shareBaseUrl}?slug=${lastExportedSlug}`, "Share link copied")}
                        className={buttonClass}
                      >
                        Copy Link
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Import */}
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Import</h3>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={importSlug}
                  onChange={(e) => setImportSlug(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleImport();
                  }}
                  placeholder="Paste slug here"
                  className="flex-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className={buttonClass}
                >
                  {importing && <Loader2 className="size-3 animate-spin" />}
                  Load
                </button>
              </div>
            </section>

            {/* Danger zone (only when variant active) */}
            {activeVariant && (
              <section>
                <h3 className="mb-2 text-xs font-medium text-red-400 uppercase tracking-wider">Danger Zone</h3>
                <button
                  type="button"
                  onClick={handleDelete}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    confirmingDelete
                      ? "border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "border-red-500/50 text-red-400 hover:bg-red-500/10",
                  )}
                >
                  {confirmingDelete ? "Click again to confirm" : `Delete "${activeVariant.name}"`}
                </button>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
