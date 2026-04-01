import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Variant<T> {
  id: string;
  name: string;
  slug?: string;
  settings: T;
  createdAt: number;
  updatedAt: number;
}

export interface VariantStore<T> {
  activeId: string | null;
  variants: Variant<T>[];
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadVariantStore<T>(storageKey: string): VariantStore<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.variants)) return null;

    const validVariants = parsed.variants.filter((v: unknown) => {
      if (!v || typeof v !== "object") return false;
      const entry = v as Record<string, unknown>;
      return typeof entry.id === "string" && typeof entry.name === "string" && entry.settings != null;
    });

    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
    const activeExists = activeId !== null && validVariants.some((v: Variant<T>) => v.id === activeId);
    return { activeId: activeExists ? activeId : null, variants: validVariants } as VariantStore<T>;
  } catch (error) {
    console.error(`Failed to load variant store from localStorage (${storageKey})`, error);
  }
  return null;
}

function saveVariantStore<T>(storageKey: string, store: VariantStore<T>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(store));
  } catch (error) {
    console.error(`Failed to persist variant store to localStorage (${storageKey})`, error);
  }
}

function clearVariantStore(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn(`[variants] Failed to clear localStorage key "${storageKey}":`, error);
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseVariantsReturn<T> {
  store: VariantStore<T>;
  activeVariant: Variant<T> | null;
  createVariant: (name: string, settings: T) => Variant<T>;
  saveToActive: (settings: T) => void;
  deleteVariant: (id: string) => void;
  renameVariant: (id: string, name: string) => void;
  setActive: (id: string | null) => void;
  setVariantSlug: (id: string, slug: string) => void;
}

interface UseVariantsOptions<T> {
  storageKey: string;
  /** Tool identifier for Convex storage (e.g., "singleCatPlus"). When provided, syncs to Convex for authenticated users. */
  toolKey?: string;
  /** One-time migration callback; runs only when no store exists in localStorage. */
  migrate?: () => { name: string; settings: T; cleanup?: () => void } | null;
}

export function useVariants<T>(options: UseVariantsOptions<T>): UseVariantsReturn<T> {
  const { storageKey, toolKey, migrate } = options;
  const { isAuthenticated } = useConvexAuth();

  // Convex queries/mutations — only active when toolKey is provided and authenticated
  const convexVariants = useQuery(
    api.userVariants.list,
    toolKey && isAuthenticated ? { toolKey } : "skip"
  );
  const upsertVariant = useMutation(api.userVariants.upsert);
  const removeVariant = useMutation(api.userVariants.remove);
  const renameVariantMut = useMutation(api.userVariants.rename);
  const setActiveMut = useMutation(api.userVariants.setActive);
  const importBatchMut = useMutation(api.userVariants.importBatch);

  const useConvex = Boolean(toolKey && isAuthenticated);

  const [localStore, setLocalStore] = useState<VariantStore<T>>({ activeId: null, variants: [] });
  const initialized = useRef(false);
  const importedRef = useRef(false);

  // Load from localStorage on mount (for anonymous mode or initial load)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const existing = loadVariantStore<T>(storageKey);
    if (existing) {
      setLocalStore(existing);
      return;
    }

    if (migrate) {
      const migrated = migrate();
      if (migrated) {
        const now = Date.now();
        const variant: Variant<T> = {
          id: crypto.randomUUID(),
          name: migrated.name,
          settings: migrated.settings,
          createdAt: now,
          updatedAt: now,
        };
        const newStore: VariantStore<T> = { activeId: variant.id, variants: [variant] };
        saveVariantStore(storageKey, newStore);
        migrated.cleanup?.();
        setLocalStore(newStore);
      }
    }
  }, [storageKey, migrate]);

  // Auto-import localStorage variants to Convex on first authenticated visit
  useEffect(() => {
    if (!useConvex || !toolKey || importedRef.current) return;
    if (convexVariants === undefined) return; // still loading

    const localData = loadVariantStore<T>(storageKey);
    if (!localData || localData.variants.length === 0) {
      importedRef.current = true;
      return;
    }

    // Check if any local variants are missing from Convex
    const convexIds = new Set(convexVariants.map((v) => v.variantId));
    const toImport = localData.variants.filter((v) => !convexIds.has(v.id));

    if (toImport.length === 0) {
      importedRef.current = true;
      clearVariantStore(storageKey);
      return;
    }

    importedRef.current = true;
    void importBatchMut({
      toolKey,
      variants: toImport.map((v) => ({
        variantId: v.id,
        name: v.name,
        slug: v.slug,
        settings: v.settings as Record<string, unknown>,
        isActive: v.id === localData.activeId,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
    }).then(() => {
      clearVariantStore(storageKey);
    }).catch((err) => {
      console.error("[useVariants] auto-import failed:", err);
      importedRef.current = false; // allow retry on next mount
    });
  }, [useConvex, toolKey, convexVariants, storageKey, importBatchMut]);

  // Persist localStorage changes (anonymous mode only)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (useConvex) return; // Convex handles persistence
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveVariantStore(storageKey, localStore);
  }, [storageKey, localStore, useConvex]);

  // Build the effective store from Convex data when authenticated
  const store: VariantStore<T> = useConvex && convexVariants
    ? {
        activeId: convexVariants.find((v) => v.isActive)?.variantId ?? null,
        variants: convexVariants.map((v) => ({
          id: v.variantId,
          name: v.name,
          slug: v.slug,
          settings: v.settings as T,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
      }
    : localStore;

  const activeVariant = store.variants.find((v) => v.id === store.activeId) ?? null;

  const createVariant = useCallback((name: string, settings: T): Variant<T> => {
    const now = Date.now();
    const variant: Variant<T> = {
      id: crypto.randomUUID(),
      name,
      settings,
      createdAt: now,
      updatedAt: now,
    };

    if (useConvex && toolKey) {
      upsertVariant({
        toolKey,
        variantId: variant.id,
        name,
        settings: settings as Record<string, unknown>,
        isActive: true,
      }).catch((err) => console.error("[useVariants] create sync failed:", err));
    }

    setLocalStore((prev) => ({
      activeId: variant.id,
      variants: [...prev.variants, variant],
    }));
    return variant;
  }, [useConvex, toolKey, upsertVariant]);

  const saveToActive = useCallback((settings: T) => {
    if (useConvex && toolKey) {
      const active = store.variants.find((v) => v.id === store.activeId);
      if (active) {
        upsertVariant({
          toolKey,
          variantId: active.id,
          name: active.name,
          settings: settings as Record<string, unknown>,
          isActive: true,
        }).catch((err) => console.error("[useVariants] save sync failed:", err));
      }
    }
    setLocalStore((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === prev.activeId
            ? { ...v, settings, updatedAt: Date.now() }
            : v
        ),
      };
    });
  }, [useConvex, toolKey, upsertVariant, store.variants, store.activeId]);

  const deleteVariant = useCallback((id: string) => {
    if (useConvex) {
      removeVariant({ variantId: id }).catch((err) => console.error("[useVariants] delete sync failed:", err));
    }
    setLocalStore((prev) => ({
      activeId: prev.activeId === id ? null : prev.activeId,
      variants: prev.variants.filter((v) => v.id !== id),
    }));
  }, [useConvex, removeVariant]);

  const renameVariant = useCallback((id: string, name: string) => {
    if (useConvex) {
      renameVariantMut({ variantId: id, name }).catch((err) => console.error("[useVariants] rename sync failed:", err));
    }
    setLocalStore((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.id === id ? { ...v, name, updatedAt: Date.now() } : v
      ),
    }));
  }, [useConvex, renameVariantMut]);

  const setActive = useCallback((id: string | null) => {
    if (useConvex && toolKey) {
      setActiveMut({ toolKey, variantId: id ?? undefined }).catch((err) => console.error("[useVariants] setActive sync failed:", err));
    }
    setLocalStore((prev) => ({ ...prev, activeId: id }));
  }, [useConvex, toolKey, setActiveMut]);

  const setVariantSlug = useCallback((id: string, slug: string) => {
    if (useConvex && toolKey) {
      const variant = store.variants.find((v) => v.id === id);
      if (variant) {
        upsertVariant({
          toolKey,
          variantId: id,
          name: variant.name,
          slug,
          settings: variant.settings as Record<string, unknown>,
          isActive: variant.id === store.activeId,
        }).catch((err) => console.error("[useVariants] slug sync failed:", err));
      }
    }
    setLocalStore((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.id === id ? { ...v, slug } : v
      ),
    }));
  }, [useConvex, toolKey, upsertVariant, store.variants, store.activeId]);

  return { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive, setVariantSlug };
}
