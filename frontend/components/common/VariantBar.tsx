"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseVariantsReturn } from "@/utils/variants";

interface VariantBarProps<T> {
  variants: UseVariantsReturn<T>;
  snapshotConfig: T;
  applyConfig: (settings: T) => void;
  isDirty: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function VariantBar<T>({
  variants,
  snapshotConfig,
  applyConfig,
  isDirty,
  showToast,
}: VariantBarProps<T>) {
  const { isAuthenticated } = useConvexAuth();
  const { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive } = variants;

  if (!isAuthenticated) return null;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Reset manage state when closed
  useEffect(() => {
    if (!manageOpen) {
      setRenamingId(null);
      setConfirmDeleteId(null);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    }
  }, [manageOpen]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

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

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameVariant(renamingId, trimmed);
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renameVariant]);

  const handleDelete = useCallback((id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmDeleteId(null);
        confirmTimerRef.current = null;
      }, 3000);
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    deleteVariant(id);
    setConfirmDeleteId(null);
    showToast("Variant deleted");
  }, [confirmDeleteId, deleteVariant, showToast]);

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <div className="relative z-30 rounded-2xl border border-border/40 bg-background/60 backdrop-blur px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Variant selector dropdown */}
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

          {/* Dirty indicator */}
          {activeVariant && isDirty && (
            <span className="size-2 rounded-full bg-amber-400" title="Unsaved changes" />
          )}

          {/* Save */}
          {activeVariant && (
            <button type="button" onClick={handleSave} disabled={!isDirty} className={buttonClass}>
              Save
            </button>
          )}

          {/* New */}
          <button type="button" onClick={handleNew} className={buttonClass}>
            + New
          </button>

          {/* Manage */}
          {store.variants.length > 0 && (
            <button type="button" onClick={() => setManageOpen(true)} className={buttonClass}>
              Manage
            </button>
          )}
        </div>
      </div>

      {/* Manage popup */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if (e.target === e.currentTarget) setManageOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setManageOpen(false);
            }
          }}
        >
          <div className="relative mx-4 w-full max-w-md rounded-3xl border border-border/40 bg-background/95 p-6 shadow-2xl backdrop-blur">
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition"
            >
              <X className="size-4" />
            </button>

            <h2 className="mb-4 text-sm font-semibold text-foreground">Manage Variants</h2>

            <div className="space-y-1">
              {store.variants.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 transition",
                    v.id === store.activeId
                      ? "bg-primary/10 border border-primary/30"
                      : "border border-transparent hover:bg-foreground/5"
                  )}
                >
                  {/* Active indicator / select button */}
                  <button
                    type="button"
                    onClick={() => handleSelectVariant(v.id === store.activeId ? null : v.id)}
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border transition",
                      v.id === store.activeId
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/50 text-transparent hover:border-primary/50"
                    )}
                    title={v.id === store.activeId ? "Deselect" : "Set as active"}
                  >
                    <Check className="size-3" />
                  </button>

                  {/* Name / rename */}
                  <div className="flex-1 min-w-0">
                    {renamingId === v.id ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="w-full rounded border border-border/50 bg-background/80 px-2 py-0.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <span className="text-xs text-foreground truncate block">{v.name}</span>
                    )}
                  </div>

                  {/* Rename button */}
                  <button
                    type="button"
                    onClick={() => startRename(v.id, v.name)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition"
                    title="Rename"
                  >
                    <Pencil className="size-3.5" />
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    className={cn(
                      "shrink-0 transition",
                      confirmDeleteId === v.id
                        ? "text-red-400 animate-pulse"
                        : "text-muted-foreground hover:text-red-400"
                    )}
                    title={confirmDeleteId === v.id ? "Click again to confirm" : "Delete"}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {store.variants.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No variants yet. Create one with &quot;+ New&quot;.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
