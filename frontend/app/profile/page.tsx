"use client";

import { useState, useEffect, useRef } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { ChevronDown, ChevronRight, Download, Loader2, Save, Trash2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { signIn, signOut } from "@/lib/shooAuth";
import { setAccountDeleting } from "@/components/auth/UserAuthButton";
import { PageHero } from "@/components/common/PageHero";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const allVariants = useQuery(api.userVariants.listAll, isAuthenticated ? {} : "skip");
  const removeVariant = useMutation(api.userVariants.remove);
  const importBatchMut = useMutation(api.userVariants.importBatch);

  const [username, setUsername] = useState("");
  const [showProfilePic, setShowProfilePic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Seed form fields from viewer data
  useEffect(() => {
    if (viewer && !initialized) {
      setUsername(viewer.username ?? "");
      setShowProfilePic(viewer.showProfilePic ?? true);
      setInitialized(true);
    }
  }, [viewer, initialized]);

  // Reset form state on sign-out
  useEffect(() => {
    if (!isAuthenticated) {
      setInitialized(false);
      setUsername("");
      setShowProfilePic(true);
    }
  }, [isAuthenticated]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    setAccountDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted");
    } catch (err) {
      setAccountDeleting(false);
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
      return;
    }
    signOut();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ username: username.trim() || undefined, showProfilePic });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <PageHero
          eyebrow="Profile"
          title="Sign in to continue"
          description="You need to be signed in to view and edit your profile."
        />
        <div className="flex justify-center">
          <button
            onClick={() => signIn()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50",
              "px-5 py-2.5 text-sm font-semibold text-muted-foreground",
              "transition hover:bg-foreground hover:text-background"
            )}
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  const isLoading = viewer === undefined;
  const initial = viewer?.username?.[0]?.toUpperCase();

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <PageHero
        eyebrow="Profile"
        title={viewer?.username ? `Hello ${viewer.username}` : "Hii You?"}
      />

      {isLoading || !viewer ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
        <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
          <div className="space-y-6">
            {/* Avatar + Username Preview */}
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex size-16 items-center justify-center overflow-hidden rounded-full",
                  "border border-border/50 bg-primary/15"
                )}
              >
                {initial ? (
                  <span className="text-xl font-bold text-primary">{initial}</span>
                ) : (
                  <User className="size-8 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {viewer.username ?? "No username set"}
                </p>
              </div>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-foreground"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                className={cn(
                  "w-full rounded-lg border border-border/50 bg-background px-3 py-2",
                  "text-sm text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
                placeholder="Choose a username"
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, hyphens, and underscores only. {username.length}/30
              </p>
            </div>

            {/* Show Profile Picture Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Show Profile Picture
                </p>
                <p className="text-xs text-muted-foreground">
                  When disabled, a generic icon will be shown instead.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showProfilePic}
                onClick={() => setShowProfilePic((prev) => !prev)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
                  "border-2 border-transparent transition-colors",
                  showProfilePic ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-5 rounded-full bg-white shadow-lg",
                    "transition-transform",
                    showProfilePic ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2",
                  "text-sm font-medium text-white transition-colors",
                  "hover:bg-amber-700 disabled:opacity-50"
                )}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </section>

        {/* Saved Variants */}
        <VariantsSection
          variants={allVariants ?? []}
          expandedTools={expandedTools}
          onToggleTool={(tool) =>
            setExpandedTools((prev) => {
              const next = new Set(prev);
              next.has(tool) ? next.delete(tool) : next.add(tool);
              return next;
            })
          }
          onDeleteVariant={async (variantId) => {
            try {
              await removeVariant({ variantId });
              toast.success("Variant deleted");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to delete");
            }
          }}
          onImportBatch={importBatchMut}
        />

        {/* Danger Zone */}
        <section className="rounded-2xl border border-red-500/30 bg-background/80 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-400">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <button
              onClick={handleDelete}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-red-500/50 px-4 py-2",
                "text-sm font-medium text-red-400 transition-colors",
                "hover:bg-red-500/10"
              )}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </section>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Variants section
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  singleCatPlus: "Single Cat Plus",
  paletteGenerator: "Palette Generator",
  pixelator: "Pixelator",
};

type VariantDoc = {
  variantId: string;
  toolKey: string;
  name: string;
  isActive: boolean;
  createdAt: number;
};

const TOOL_STORAGE_KEYS: Record<string, string> = {
  singleCatPlus: "singleCatPlus.variants",
  paletteGenerator: "paletteGenerator.variants",
  pixelator: "pixelator-variants",
};

const TOOL_API_PATHS: Record<string, string> = {
  singleCatPlus: "/api/single-cat-settings",
  paletteGenerator: "/api/palette-generator-settings",
  pixelator: "/api/pixelator-settings",
};

function VariantsSection({
  variants,
  expandedTools,
  onToggleTool,
  onDeleteVariant,
  onImportBatch,
}: {
  variants: VariantDoc[];
  expandedTools: Set<string>;
  onToggleTool: (tool: string) => void;
  onDeleteVariant: (variantId: string) => Promise<void>;
  onImportBatch: (args: {
    toolKey: string;
    variants: {
      variantId: string;
      name: string;
      slug?: string;
      settings: Record<string, unknown>;
      isActive: boolean;
      createdAt: number;
      updatedAt: number;
    }[];
  }) => Promise<{ imported: number; total: number }>;
}) {
  const [importing, setImporting] = useState(false);
  const [slugImporting, setSlugImporting] = useState(false);
  const [slugValue, setSlugValue] = useState("");
  const [slugToolKey, setSlugToolKey] = useState("singleCatPlus");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group by toolKey
  const grouped = new Map<string, VariantDoc[]>();
  for (const v of variants) {
    const list = grouped.get(v.toolKey) ?? [];
    list.push(v);
    grouped.set(v.toolKey, list);
  }

  const handleImportFromBrowser = async () => {
    setImporting(true);
    let totalImported = 0;
    try {
      for (const [toolKey, storageKey] of Object.entries(TOOL_STORAGE_KEYS)) {
        const raw = localStorage.getItem(storageKey);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.variants) || parsed.variants.length === 0) continue;
          const result = await onImportBatch({
            toolKey,
            variants: parsed.variants.map((v: { id: string; name: string; slug?: string; settings: unknown; createdAt: number; updatedAt: number }) => ({
              variantId: v.id,
              name: v.name,
              slug: v.slug,
              settings: v.settings as Record<string, unknown>,
              isActive: v.id === parsed.activeId,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
            })),
          });
          totalImported += result.imported;
          if (result.imported > 0) localStorage.removeItem(storageKey);
        } catch (err) {
          console.error(`[import] failed for ${toolKey}:`, err);
        }
      }
      toast.success(totalImported > 0 ? `Imported ${totalImported} variant(s)` : "No new variants found in browser storage");
    } finally {
      setImporting(false);
    }
  };

  const handleExportAll = () => {
    const data = JSON.stringify(variants, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beastypage-variants.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Variants exported");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as VariantDoc[];
      if (!Array.isArray(data) || data.length === 0) {
        toast.error("No variants found in file");
        return;
      }
      // Group by toolKey and import each batch
      const byTool = new Map<string, VariantDoc[]>();
      for (const v of data) {
        if (!v.toolKey || !v.variantId) continue;
        const list = byTool.get(v.toolKey) ?? [];
        list.push(v);
        byTool.set(v.toolKey, list);
      }
      let totalImported = 0;
      for (const [toolKey, toolVariants] of byTool) {
        const result = await onImportBatch({
          toolKey,
          variants: toolVariants.map((v) => ({
            variantId: v.variantId,
            name: v.name,
            settings: (v as unknown as { settings: Record<string, unknown> }).settings ?? {},
            isActive: v.isActive,
            createdAt: v.createdAt,
            updatedAt: Date.now(),
          })),
        });
        totalImported += result.imported;
      }
      toast.success(totalImported > 0 ? `Imported ${totalImported} variant(s)` : "No new variants found");
    } catch (err) {
      console.error("[importFile]", err);
      toast.error("Failed to import file");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImportSlug = async () => {
    const slug = slugValue.trim();
    if (!slug) {
      toast.error("Enter a slug");
      return;
    }
    const apiPath = TOOL_API_PATHS[slugToolKey];
    if (!apiPath) {
      toast.error("Unknown tool");
      return;
    }
    setSlugImporting(true);
    try {
      const res = await fetch(`${apiPath}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error(res.status === 404 ? "Slug not found" : "Failed to load");
        return;
      }
      const json = (await res.json()) as { config?: unknown; slug?: string };
      if (!json.config) {
        toast.error("Invalid config");
        return;
      }
      const now = Date.now();
      const result = await onImportBatch({
        toolKey: slugToolKey,
        variants: [{
          variantId: crypto.randomUUID(),
          name: `Import ${slug.slice(0, 8)}`,
          slug,
          settings: json.config as Record<string, unknown>,
          isActive: false,
          createdAt: now,
          updatedAt: now,
        }],
      });
      if (result.imported > 0) {
        toast.success("Variant imported from slug");
        setSlugValue("");
      } else {
        toast.success("Variant already exists");
      }
    } catch (err) {
      console.error("[importSlug]", err);
      toast.error("Import failed");
    } finally {
      setSlugImporting(false);
    }
  };

  const btnClass = cn(
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5",
    "text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background",
    "disabled:opacity-50"
  );

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Saved Variants
      </h3>

      {/* Import / Export row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={handleImportFromBrowser} disabled={importing} className={btnClass}>
          {importing ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          From browser
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={importing} className={btnClass}>
          <Upload className="size-3" />
          From file
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        {variants.length > 0 && (
          <button onClick={handleExportAll} className={btnClass}>
            <Download className="size-3" />
            Export all
          </button>
        )}
      </div>

      {/* Slug import */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={slugToolKey}
          onChange={(e) => setSlugToolKey(e.target.value)}
          className="rounded-lg border border-border/50 bg-background px-2 py-1.5 text-xs text-foreground"
        >
          {Object.entries(TOOL_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          value={slugValue}
          onChange={(e) => setSlugValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleImportSlug(); }}
          placeholder="Paste slug to import"
          className="flex-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button onClick={() => void handleImportSlug()} disabled={slugImporting} className={btnClass}>
          {slugImporting ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          Import slug
        </button>
      </div>
      <div className="space-y-2">
          {Object.entries(TOOL_LABELS).map(([toolKey, label]) => {
            const toolVariants = grouped.get(toolKey) ?? [];
            const expanded = expandedTools.has(toolKey);
            return (
              <div key={toolKey} className="rounded-lg border border-border/30">
                <button
                  onClick={() => onToggleTool(toolKey)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-2.5",
                    "text-sm font-medium text-foreground transition hover:bg-foreground/5",
                    expanded ? "rounded-t-lg" : "rounded-lg"
                  )}
                >
                  <span>
                    {label}{" "}
                    <span className="text-muted-foreground">({toolVariants.length})</span>
                  </span>
                  {expanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>
                {expanded && (
                  <div className="border-t border-border/20 px-4 py-2 space-y-1">
                    {toolVariants.length === 0 ? (
                      <p className="py-1 text-xs text-muted-foreground">No variants</p>
                    ) : (
                      toolVariants.map((v) => (
                        <div
                          key={v.variantId}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-sm text-foreground">
                            {v.name}
                            {v.isActive && (
                              <span className="ml-2 text-xs text-primary">(active)</span>
                            )}
                          </span>
                          <button
                            onClick={() => void onDeleteVariant(v.variantId)}
                            className="text-xs text-muted-foreground hover:text-red-400 transition"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
