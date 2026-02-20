"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Save, Loader2 } from "lucide-react";
import XIcon from "@/components/ui/x-icon";
import CopyIcon from "@/components/ui/copy-icon";
import CheckedIcon from "@/components/ui/checked-icon";
import LockIcon from "@/components/ui/lock-icon";
import ExternalLinkIcon from "@/components/ui/external-link-icon";

interface SaveTreeDialogProps {
  currentName: string;
  currentCreator?: string;
  currentSlug: string;
  hasPassword?: boolean;
  onSave: (name: string, creatorName: string, password?: string) => Promise<{ success: boolean; error?: string; slug?: string; isNew?: boolean }>;
  onClose: () => void;
}

export function SaveTreeDialog({
  currentName,
  currentCreator,
  currentSlug,
  hasPassword: initialHasPassword,
  onSave,
  onClose,
}: SaveTreeDialogProps) {
  // Capture initial values once on mount; dialog is opened/closed by mounting.
  const initialValuesRef = useRef({
    name: currentName,
    creatorName: currentCreator ?? "",
  });
  const [name, setName] = useState(initialValuesRef.current.name);
  const [creatorName, setCreatorName] = useState(initialValuesRef.current.creatorName);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Refs for timeout cleanup
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  // Check if the current slug exists and has a password
  const slugCheck = useQuery(api.ancestryTree.checkSlug, { slug: currentSlug });
  const slugExists = slugCheck?.exists ?? false;
  const treeHasPassword = initialHasPassword ?? slugCheck?.hasPassword ?? false;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a tree name");
      return;
    }

    // If tree exists and has password, require password
    if (slugExists && treeHasPassword && !password) {
      setError("Password required to overwrite this tree");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Pass password for verification (existing tree) or newPassword for setting (new tree)
      const passwordToSend = slugExists && treeHasPassword ? password : newPassword || undefined;
      const result = await onSave(name.trim(), creatorName.trim(), passwordToSend);

      if (!result.success) {
        if (result.error === "password_required") {
          setError("Password required to overwrite this tree");
        } else if (result.error === "invalid_password") {
          setError("Incorrect password");
        } else {
          setError(result.error ?? "Failed to save tree");
        }
        return;
      }

      // Success!
      setSavedSlug(result.slug ?? currentSlug);
      setSaveSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tree");
    } finally {
      setIsSaving(false);
    }
  };

  const getTreeUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/projects/warrior-cats/ancestry-tree/${savedSlug ?? currentSlug}`;
  }, [savedSlug, currentSlug]);

  const handleCopyUrl = useCallback(async () => {
    // Clear any existing timeouts
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);

    setCopyError(false);
    try {
      await navigator.clipboard.writeText(getTreeUrl());
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
      setCopyError(true);
      errorTimeoutRef.current = setTimeout(() => setCopyError(false), 3000);
    }
  }, [getTreeUrl]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(getTreeUrl(), "_blank", "noopener,noreferrer");
  }, [getTreeUrl]);

  // Success state
  if (saveSuccess) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="glass-card relative w-full max-w-md p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <XIcon size={20} />
          </button>

          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckedIcon className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold">Tree Saved!</h2>
            <p className="text-sm text-muted-foreground">
              Your tree has been saved successfully.
            </p>

            {/* URL Display */}
            <div className="bg-white/5 rounded-lg p-3 text-left">
              <p className="block text-xs text-muted-foreground mb-1">Share URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-amber-400 truncate">
                  {getTreeUrl()}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className={`shrink-0 rounded-md p-2 transition-colors hover:bg-white/10 ${copyError ? "text-red-400" : ""}`}
                  title={copyError ? "Failed to copy" : "Copy URL"}
                >
                  {copied ? (
                    <CheckedIcon size={16} className="text-emerald-400" />
                  ) : copyError ? (
                    <XIcon size={16} />
                  ) : (
                    <CopyIcon size={16} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="shrink-0 rounded-md p-2 transition-colors hover:bg-white/10"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon size={16} />
                </button>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="glass-card relative w-full max-w-md p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <XIcon size={20} />
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

          {/* Password Section */}
          {slugExists && treeHasPassword ? (
            // Tree exists and has password - need to enter it to overwrite
            <div>
              <label htmlFor="password" className="flex items-center gap-2 text-sm font-medium mb-1">
                <LockIcon size={14} className="text-amber-400" />
                Password to Overwrite
                <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter tree password"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This tree is password protected. Enter the password to update it.
              </p>
            </div>
          ) : (
            // New tree or unprotected tree - offer to set a password
            <div>
              <label htmlFor="newPassword" className="flex items-center gap-2 text-sm font-medium mb-1">
                <LockIcon size={14} />
                Set Password <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Protect this tree with a password"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set a password to prevent others from overwriting your tree.
              </p>
            </div>
          )}

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
              {slugExists ? "Update Tree" : "Save Tree"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
