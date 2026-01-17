"use client";

import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";

interface SaveTreeDialogProps {
  currentName: string;
  currentCreator?: string;
  onSave: (name: string, creatorName: string) => Promise<void>;
  onClose: () => void;
}

export function SaveTreeDialog({
  currentName,
  currentCreator,
  onSave,
  onClose,
}: SaveTreeDialogProps) {
  const [name, setName] = useState(currentName);
  const [creatorName, setCreatorName] = useState(currentCreator ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a tree name");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(name.trim(), creatorName.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tree");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card relative w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <h2 className="mb-6 text-xl font-bold">Save Ancestry Tree</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="treeName" className="block text-sm font-medium mb-1">
              Tree Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="treeName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ThunderClan Lineage"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="creatorName" className="block text-sm font-medium mb-1">
              Creator Name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              id="creatorName"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Tree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
