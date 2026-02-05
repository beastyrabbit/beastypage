"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseConvexPayload,
  type PageVariantSettings,
  type UsePageVariantsReturn,
} from "../../utils/pageVariants";

interface VariantBarProps {
  variants: UsePageVariantsReturn;
  snapshotConfig: PageVariantSettings;
  applyConfig: (settings: PageVariantSettings) => void;
  isDirty: boolean;
  showToast: (message: string) => void;
  copyText: (text: string, successMessage: string) => Promise<void>;
}

export function VariantBar({
  variants,
  snapshotConfig,
  applyConfig,
  isDirty,
  showToast,
  copyText,
}: VariantBarProps) {
  const { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive } = variants;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [importSlug, setImportSlug] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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

  const handleNew = useCallback(() => {
    const name = `Variant ${store.variants.length + 1}`;
    createVariant(name, snapshotConfig);
    showToast("Variant created");
  }, [store.variants.length, snapshotConfig, createVariant, showToast]);

  const handleSave = useCallback(() => {
    saveToActive(snapshotConfig);
    showToast("Variant saved");
  }, [snapshotConfig, saveToActive, showToast]);

  const handleDelete = useCallback(() => {
    if (!activeVariant) return;
    if (!window.confirm(`Delete "${activeVariant.name}"?`)) return;
    deleteVariant(activeVariant.id);
    showToast("Variant deleted");
  }, [activeVariant, deleteVariant, showToast]);

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
    setExporting(true);
    try {
      const response = await fetch("/api/single-cat-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ config: snapshotConfig }),
      });
      if (!response.ok) throw new Error("Failed to export");
      const json = (await response.json()) as { slug?: string };
      const slug = json.slug?.trim();
      if (!slug) throw new Error("No slug returned");
      await copyText(slug, "Slug copied to clipboard");
    } catch (error) {
      console.error("handleExport", error);
      showToast(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [snapshotConfig, copyText, showToast]);

  const handleImport = useCallback(async () => {
    const normalized = importSlug.trim();
    if (!normalized) {
      showToast("Enter a slug to import");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch(
        `/api/single-cat-settings?slug=${encodeURIComponent(normalized)}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) {
        showToast(response.status === 404 ? "Slug not found" : "Failed to load");
        return;
      }
      const json = (await response.json()) as { config?: unknown };
      if (!json.config) {
        showToast("Invalid config");
        return;
      }
      const settings = parseConvexPayload(json.config);
      const variant = createVariant(`Import ${normalized.slice(0, 7)}`, settings);
      applyConfig(variant.settings);
      setImportSlug("");
      showToast("Variant imported");
    } catch (error) {
      console.error("handleImport", error);
      showToast("Import failed");
    } finally {
      setImporting(false);
    }
  }, [importSlug, createVariant, applyConfig, showToast]);

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="relative z-10 rounded-2xl border border-border/40 bg-background/60 backdrop-blur px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Variant dropdown */}
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
            {isDirty && (
              <span className="size-2 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
          </div>
        )}

        {/* Save (active variant only) */}
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

        {/* New */}
        <button type="button" onClick={handleNew} className={buttonClass}>
          + New
        </button>

        {/* Delete */}
        {activeVariant && (
          <button type="button" onClick={handleDelete} className={buttonClass}>
            Delete
          </button>
        )}

        {/* Separator */}
        <div className="mx-1 h-5 w-px bg-border/40" />

        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className={buttonClass}
        >
          {exporting ? <Loader2 className="size-3 animate-spin" /> : null}
          Export
        </button>

        {/* Import */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={importSlug}
            onChange={(e) => setImportSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImport();
            }}
            placeholder="Slug"
            className="w-24 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className={buttonClass}
          >
            {importing ? <Loader2 className="size-3 animate-spin" /> : null}
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
