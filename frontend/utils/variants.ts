import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Variant<T> {
  id: string;
  name: string;
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

    // Filter out malformed variant entries
    const validVariants = parsed.variants.filter((v: unknown) => {
      if (!v || typeof v !== "object") return false;
      const entry = v as Record<string, unknown>;
      return typeof entry.id === "string" && typeof entry.name === "string" && entry.settings != null;
    });
    if (validVariants.length !== parsed.variants.length) {
      console.warn(
        `loadVariantStore(${storageKey}): filtered out ${parsed.variants.length - validVariants.length} malformed variant(s)`,
      );
    }

    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
    // Reset activeId if it references a variant that was filtered out
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
}

interface UseVariantsOptions<T> {
  storageKey: string;
  /** One-time migration callback; runs only when no store exists in localStorage. Should be a stable reference (module-level function or useCallback). If a cleanup callback is returned, it is called after the migrated data has been persisted. */
  migrate?: () => { name: string; settings: T; cleanup?: () => void } | null;
}

export function useVariants<T>(options: UseVariantsOptions<T>): UseVariantsReturn<T> {
  const { storageKey, migrate } = options;

  const [store, setStore] = useState<VariantStore<T>>({ activeId: null, variants: [] });
  const initialized = useRef(false);

  // Load from localStorage on mount; runs post-hydration to avoid SSR/client mismatch
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const existing = loadVariantStore<T>(storageKey);
    if (existing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStore(existing);
      return;
    }

    // Run one-time migration if provided
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
        setStore(newStore);
      }
    }
  }, [storageKey, migrate]);

  // Persist on change — skip the initial render to avoid overwriting localStorage before the load effect runs
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveVariantStore(storageKey, store);
  }, [storageKey, store]);

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
    setStore((prev) => ({
      activeId: variant.id,
      variants: [...prev.variants, variant],
    }));
    return variant;
  }, []);

  const saveToActive = useCallback((settings: T) => {
    setStore((prev) => {
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
  }, []);

  const deleteVariant = useCallback((id: string) => {
    setStore((prev) => ({
      activeId: prev.activeId === id ? null : prev.activeId,
      variants: prev.variants.filter((v) => v.id !== id),
    }));
  }, []);

  const renameVariant = useCallback((id: string, name: string) => {
    setStore((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.id === id ? { ...v, name, updatedAt: Date.now() } : v
      ),
    }));
  }, []);

  const setActive = useCallback((id: string | null) => {
    setStore((prev) => ({ ...prev, activeId: id }));
  }, []);

  return { store, activeVariant, createVariant, saveToActive, deleteVariant, renameVariant, setActive };
}
