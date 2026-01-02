"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CatdexPayload } from "@/convex/catdex";
import type { SeasonPayload } from "@/convex/seasons";
import type { RarityPayload } from "@/convex/rarities";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { CONVEX_HTTP_URL } from "@/lib/convexClient";
import { Search, Sparkles, X } from "lucide-react";
import ProgressiveImage from "@/components/common/ProgressiveImage";
import Image from "next/image";

type SortKey =
  | "number-asc"
  | "number-desc"
  | "name-asc"
  | "name-desc"
  | "rarity-asc"
  | "rarity-desc"
  | "updated-desc";

type ImageVariant = "default" | "custom";

type CreateCatInput = {
  seasonId: string;
  rarityId: string;
  catName: string;
  owner: string;
  cardNumber?: string;
  defaultFile: File;
  customFile?: File | null;
};

type MassUploadEntry = {
  id: string;
  defaultFile: File;
  previewUrl: string;
  catName: string;
  seasonId: string;
  rarityId: string;
  cardNumber: string;
  customFile: File | null;
  status: "idle" | "success" | "error" | "uploading";
  message?: string;
};

const MASS_UPLOAD_HOLD_MS = 5000;

type SubmitModalProps = {
  open: boolean;
  onClose: () => void;
  seasons: SeasonPayload[];
  rarities: RarityPayload[];
  onSubmit: (input: CreateCatInput) => Promise<void>;
};

type MassUploadModalProps = {
  onClose: () => void;
  seasons: SeasonPayload[];
  rarities: RarityPayload[];
  onSubmit: (input: CreateCatInput) => Promise<void>;
};


export default function CatdexPage() {
  const cats = useQuery(api.catdex.list, {});
  const seasons = useQuery(api.seasons.list, {});
  const rarities = useQuery(api.rarities.list, {});
  const pendingCount = useQuery(api.catdex.pendingCount, {});
  const createCatMutation = useMutation(api.catdex.create);

  const [search, setSearch] = useState("");
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated-desc");
  const [imageVariant, setImageVariant] = useState<ImageVariant>("default");
  const [activeCat, setActiveCat] = useState<CatdexPayload | null>(null);
  const [activeVariant, setActiveVariant] = useState<ImageVariant>("default");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [massUploadOpen, setMassUploadOpen] = useState(false);

  const submitHoldTimerRef = useRef<number | null>(null);
  const submitHoldTriggeredRef = useRef(false);

  const clearSubmitHold = useCallback(() => {
    if (submitHoldTimerRef.current) {
      window.clearTimeout(submitHoldTimerRef.current);
      submitHoldTimerRef.current = null;
    }
  }, []);

  const startSubmitHold = useCallback(() => {
    submitHoldTriggeredRef.current = false;
    clearSubmitHold();
    submitHoldTimerRef.current = window.setTimeout(() => {
      submitHoldTimerRef.current = null;
      submitHoldTriggeredRef.current = true;
      setMassUploadOpen(true);
    }, MASS_UPLOAD_HOLD_MS);
  }, [clearSubmitHold]);

  const handleSubmitButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (submitHoldTriggeredRef.current) {
      submitHoldTriggeredRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setSubmitOpen(true);
  }, []);

  const handleSubmitButtonPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== undefined && event.button !== 0) return;
      startSubmitHold();
    },
    [startSubmitHold]
  );

  const handleSubmitButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat) return;
      if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
        startSubmitHold();
      }
    },
    [startSubmitHold]
  );

  const handleSubmitButtonInputEnd = useCallback(() => {
    clearSubmitHold();
  }, [clearSubmitHold]);

  const handleCloseSubmitModal = useCallback(() => {
    clearSubmitHold();
    submitHoldTriggeredRef.current = false;
    setSubmitOpen(false);
  }, [clearSubmitHold]);

  const handleCloseMassUpload = useCallback(() => {
    clearSubmitHold();
    submitHoldTriggeredRef.current = false;
    setMassUploadOpen(false);
  }, [clearSubmitHold]);

  useEffect(() => {
    return () => {
      clearSubmitHold();
    };
  }, [clearSubmitHold]);

  const createCatRecord = useCallback(
    async ({ seasonId, rarityId, catName, owner, cardNumber, defaultFile, customFile }: CreateCatInput) => {
      const trimmedName = catName.trim();
      const trimmedOwner = owner.trim();
      if (!trimmedName) throw new Error("Cat name is required.");
      if (!trimmedOwner) throw new Error("Owner is required.");
      if (!seasonId) throw new Error("Season is required.");
      if (!rarityId) throw new Error("Rarity is required.");
      if (!defaultFile) throw new Error("Default card art is required.");

      const defaultUpload = await uploadToStorage(defaultFile);
      const customUpload = customFile ? await uploadToStorage(customFile) : null;

      await createCatMutation({
        twitchUserName: trimmedOwner.toLowerCase(),
        catName: trimmedName.toLowerCase(),
        seasonId: seasonId as Id<"card_season">,
        rarityId: rarityId as Id<"rarity">,
        ...(cardNumber && cardNumber.trim()
          ? {
              cardNumber: cardNumber.trim()
            }
          : {}),
        defaultCard: {
          storageId: defaultUpload.storageId as Id<"_storage">,
          fileName: defaultUpload.fileName
        },
        ...(customUpload
          ? {
              customCard: {
                storageId: customUpload.storageId as Id<"_storage">,
                fileName: customUpload.fileName
              }
            }
          : {})
      });
    },
    [createCatMutation]
  );

  useEffect(() => {
    if (!activeCat) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveCat(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCat]);

  const isLoading =
    !cats || !seasons || !rarities || typeof pendingCount === "undefined";

  const { filteredCats, stats } = useMemo(() => {
    if (!cats) {
      return {
        filteredCats: [] as CatdexPayload[],
        stats: {
          total: 0,
          customAvailable: false
        }
      };
    }

    const all = cats.slice();
    const hasCustom = all.some((cat) => Boolean(cat.custom_card || cat.custom_card_storage_id));

    const queryTerms = parseSearchTerms(search);

    const subset = all.filter((cat) => {
      if (!cat.approved) return false;
      if (seasonFilter !== "all" && cat.seasonRaw?.id !== seasonFilter) return false;
      if (rarityFilter !== "all" && cat.rarityRaw?.id !== rarityFilter) return false;
      if (queryTerms.length === 0) return true;
      return queryTerms.every((term) => matchesSearchTerm(cat, term));
    });

    subset.sort((a, b) => applySort(sortKey, a, b));

    return {
      filteredCats: subset,
      stats: {
        total: all.length,
        customAvailable: hasCustom
      }
    };
  }, [cats, search, seasonFilter, rarityFilter, sortKey]);

  const seasonsById = useMemo(() => mapById(seasons), [seasons]);
  const raritiesById = useMemo(() => mapById(rarities), [rarities]);

  const handleCloseDrawer = useCallback(() => {
    setActiveCat(null);
  }, []);

  const handleCardClick = useCallback(
    (cat: CatdexPayload) => {
      setActiveCat(cat);
      setActiveVariant(imageVariant);
    },
    [imageVariant]
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-10">
        <div className="glass-card flex flex-col items-center gap-3 px-6 py-8 text-muted-foreground">
          <Sparkles className="size-6 animate-spin" />
          <p>Loading Catdex…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        <p className="text-xs uppercase tracking-widest text-amber-200/90">Catdex</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Explore Gacha Cat Cards</h1>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-neutral-200/80">
          <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 font-semibold text-amber-100">
            {stats.total.toLocaleString()} cards indexed
          </span>
          <span
            className={cn(
              "rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1",
              (pendingCount ?? 0) > 0 ? "text-amber-200" : "text-neutral-300"
            )}
          >
            {(pendingCount ?? 0).toLocaleString()} pending approvals
          </span>
        </div>
      </section>

      <section className="glass-card grid gap-4 p-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr,repeat(3,minmax(0,1fr))]">
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Search by name, owner, or number (ranges like 10-40)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={seasonFilter}
            onChange={(event) => setSeasonFilter(event.target.value)}
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.season_name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={rarityFilter}
            onChange={(event) => setRarityFilter(event.target.value)}
          >
            <option value="all">All rarities</option>
            {rarities.map((rarity) => (
              <option key={rarity.id} value={rarity.id}>
                {rarity.rarity_name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            <option value="updated-desc">Recently updated</option>
            <option value="number-asc">Number ↑</option>
            <option value="number-desc">Number ↓</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="rarity-asc">Rarity ↑</option>
            <option value="rarity-desc">Rarity ↓</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {stats.customAvailable && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1",
                  imageVariant === "default"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => setImageVariant("default")}
              >
                Default art
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1",
                  imageVariant === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => setImageVariant("custom")}
              >
                Custom art
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleSubmitButtonClick}
              onPointerDown={handleSubmitButtonPointerDown}
              onPointerUp={handleSubmitButtonInputEnd}
              onPointerLeave={handleSubmitButtonInputEnd}
              onPointerCancel={handleSubmitButtonInputEnd}
              onContextMenu={handleSubmitButtonInputEnd}
              onKeyDown={handleSubmitButtonKeyDown}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
                  handleSubmitButtonInputEnd();
                }
              }}
              onBlur={handleSubmitButtonInputEnd}
              className="rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20"
            >
              Submit card
            </button>
            <span className="text-[11px] text-muted-foreground">Hold 5s for mass upload</span>
          </div>
        </div>
      </section>

      {filteredCats.length === 0 ? (
        <div className="glass-card border border-dashed border-border/60 p-12 text-center text-muted-foreground">
          No cats match the current filters.
        </div>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCats.map((cat) => {
            const sources = buildImageSources(cat, imageVariant);
            const displaySeason = cat.seasonRaw?.season_name ?? cat.season ?? "Unknown Season";
            const displayRarity = cat.rarityRaw?.rarity_name ?? cat.rarity ?? "Unknown";
            const seasonShort = seasonShortLabel(cat, displaySeason);
            const rarityShort = rarityShortLabel(displayRarity, cat.rarityRaw?.stars ?? cat.rarityStars);
            const numberShort = cat.card_number ? `#${cat.card_number}` : "—";

            return (
              <article
                key={cat.id}
                className="glass-card group flex cursor-pointer flex-col overflow-hidden transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-2xl"
                onClick={() => handleCardClick(cat)}
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  <ProgressiveImage
                    lowSrc={sources.thumb}
                    highSrc={sources.full}
                    alt={cat.cat_name ?? "Cat card"}
                    imgClassName="object-contain"
                  />
                  {!cat.approved && (
                    <span className="absolute right-3 top-3 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600">
                      Pending
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span className="font-semibold text-foreground">{numberShort}</span>
                      <span>{seasonShort}</span>
                      <span>{rarityShort}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold capitalize text-foreground">
                      {cat.cat_name ?? "Unnamed"}
                    </h3>
                    <p className="text-xs text-muted-foreground">by {cat.twitch_user_name}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <SubmitModal
        open={submitOpen}
        onClose={handleCloseSubmitModal}
        seasons={seasons}
        rarities={rarities}
        onSubmit={createCatRecord}
      />

      {massUploadOpen ? (
        <MassUploadModal
          onClose={handleCloseMassUpload}
          seasons={seasons}
          rarities={rarities}
          onSubmit={createCatRecord}
        />
      ) : null}

      <CreditBanner />

      {activeCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-10 backdrop-blur-sm">
          <div className="glass-card relative w-full max-w-3xl overflow-hidden">
            <button
              type="button"
              className="absolute right-4 top-4 z-20 rounded-full bg-black/70 p-2 text-white shadow-lg transition hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={handleCloseDrawer}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div className="grid gap-6 p-6 md:grid-cols-[1.1fr,1fr]">
              <ProgressiveImage
                lowSrc={buildImageSources(activeCat, activeVariant).thumb}
                highSrc={buildImageSources(activeCat, activeVariant).full}
                alt={activeCat.cat_name ?? "Cat preview"}
                className="w-full overflow-hidden rounded-2xl bg-muted"
                imgClassName="object-contain"
              />
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold capitalize">
                    {activeCat.cat_name ?? "Unnamed"}
                  </h2>
                  <p className="text-sm text-muted-foreground">by {activeCat.twitch_user_name}</p>
                </div>
                <div className="grid gap-2 text-xs">
                  <InfoRow label="Number" value={activeCat.card_number ? `#${activeCat.card_number}` : "—"} />
                  <InfoRow
                    label="Season"
                    value={seasonsById.get(activeCat.seasonRaw?.id ?? "")?.season_name ?? activeCat.season ?? "—"}
                  />
                  <InfoRow
                    label="Rarity"
                    value={raritiesById.get(activeCat.rarityRaw?.id ?? "")?.rarity_name ?? activeCat.rarity ?? "—"}
                  />
                  <InfoRow label="Status" value={activeCat.approved ? "Approved" : "Pending approval"} />
                </div>
                {hasCustomVariant(activeCat) && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Preview</span>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1",
                        activeVariant === "default"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                      onClick={() => setActiveVariant("default")}
                    >
                      Default art
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1",
                        activeVariant === "custom"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                      onClick={() => setActiveVariant("custom")}
                    >
                      Custom art
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function matchesSearchTerm(cat: CatdexPayload, term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return true;

  const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  const cardNumberValue = cardNumberToInt(cat);
  if (range && cardNumberValue !== null) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    return cardNumberValue >= lo && cardNumberValue <= hi;
  }

  const numeric = trimmed.replace(/^#/, "");
  if (/^\d+$/.test(numeric)) {
    return cardNumberValue !== null && cardNumberValue === Number(numeric);
  }

  const haystack = [
    cat.cat_name,
    cat.twitch_user_name,
    cat.card_number ?? "",
    cat.season ?? "",
    cat.rarity ?? "",
    cat.seasonRaw?.season_name ?? "",
    cat.rarityRaw?.rarity_name ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(trimmed.toLowerCase());
}

function applySort(sort: SortKey, a: CatdexPayload, b: CatdexPayload): number {
  switch (sort) {
    case "number-asc":
      return (cardNumberToInt(a) ?? Infinity) - (cardNumberToInt(b) ?? Infinity);
    case "number-desc":
      return (cardNumberToInt(b) ?? -Infinity) - (cardNumberToInt(a) ?? -Infinity);
    case "name-asc":
      return compareStrings(a.cat_name, b.cat_name);
    case "name-desc":
      return compareStrings(b.cat_name, a.cat_name);
    case "rarity-asc":
      return (a.rarityStars ?? Infinity) - (b.rarityStars ?? Infinity);
    case "rarity-desc":
      return (b.rarityStars ?? -Infinity) - (a.rarityStars ?? -Infinity);
    case "updated-desc":
    default:
      return (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0);
  }
}

function compareStrings(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function cardNumberToInt(cat: CatdexPayload): number | null {
  if (!cat.card_number) return null;
  const parsed = Number.parseInt(String(cat.card_number), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseSearchTerms(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function mapById<T extends { id: string }>(items: T[] | undefined | null): Map<string, T> {
  if (!items) return new Map();
  return new Map(items.map((item) => [item.id, item] as const));
}

function buildImageSources(cat: CatdexPayload, variant: ImageVariant) {
  const defaultSrc = absoluteUrl(cat.default_card_url ?? cat.default_card);
  const defaultThumb = absoluteUrl(cat.default_card_thumb_url ?? cat.default_card_thumb) ?? defaultSrc;
  const customSrc = absoluteUrl(cat.custom_card_url ?? cat.custom_card);
  const customThumb = absoluteUrl(cat.custom_card_thumb_url ?? cat.custom_card_thumb) ?? customSrc;

  if (variant === "custom" && customSrc) {
    return {
      full: customSrc,
      thumb: customThumb || defaultThumb
    };
  }

  return {
    full: defaultSrc || customSrc,
    thumb: defaultThumb || customThumb || defaultSrc || customSrc
  };
}

function hasCustomVariant(cat: CatdexPayload): boolean {
  return Boolean(absoluteUrl(cat.custom_card_url ?? cat.custom_card));
}

function absoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const preferred = new URL(CONVEX_HTTP_URL);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        parsed.protocol = preferred.protocol;
        parsed.host = preferred.host;
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
  const base = CONVEX_HTTP_URL.replace(/\/$/, "");
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

async function uploadToStorage(file: File): Promise<{ storageId: string; fileName: string }> {
  const getUrlResponse = await fetch(`${CONVEX_HTTP_URL}/api/storage/getUploadUrl`, {
    method: "POST"
  });
  if (!getUrlResponse.ok) {
    const text = await getUrlResponse.text();
    throw new Error(`Unable to request upload URL (${getUrlResponse.status}): ${text}`);
  }
  const { uploadUrl } = await getUrlResponse.json();
  if (!uploadUrl) {
    throw new Error("Convex did not return an upload URL.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Upload failed (${uploadResponse.status}): ${text}`);
  }
  const { storageId } = await uploadResponse.json();
  if (!storageId) {
    throw new Error("Upload completed but storageId was missing.");
  }
  return { storageId, fileName: file.name };
}

function inferEntryDefaults(fileName: string): { name: string; number: string } {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  const parts = withoutExt.split(/[_-]+/).filter(Boolean);
  if (!parts.length) return { name: "", number: "" };

  let number = "";
  const last = parts[parts.length - 1];
  if (last && /^(?:\d{1,4}|xx\d+|00x)$/i.test(last)) {
    number = last.toUpperCase();
    parts.pop();
  }

  const formatted = parts
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");

  return { name: formatted, number };
}

function SubmitModal({ open, onClose, seasons, rarities, onSubmit }: SubmitModalProps) {
  const [seasonId, setSeasonId] = useState<string>("");
  const [rarityId, setRarityId] = useState<string>("");
  const [catName, setCatName] = useState("");
  const [owner, setOwner] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [defaultFile, setDefaultFile] = useState<File | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaultInputRef = useRef<HTMLInputElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackSeason = seasons[0]?.id ?? "";
    const fallbackRarity = rarities[0]?.id ?? "";
    setSeasonId(fallbackSeason);
    setRarityId(fallbackRarity);
    setCatName("");
    setOwner("");
    setCardNumber("");
    setStatus(null);
    setBusy(false);
    if (defaultInputRef.current) defaultInputRef.current.value = "";
    if (customInputRef.current) customInputRef.current.value = "";
    setDefaultFile(null);
    setCustomFile(null);
  }, [open, seasons, rarities]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!defaultFile) {
      setStatus("Please upload the default card art.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        seasonId,
        rarityId,
        catName,
        owner,
        cardNumber,
        defaultFile,
        customFile
      });
      setStatus("Submission received! We'll review it shortly.");
      setCatName("");
      setCardNumber("");
      if (defaultInputRef.current) defaultInputRef.current.value = "";
      if (customInputRef.current) customInputRef.current.value = "";
      setDefaultFile(null);
      setCustomFile(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit the card.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10"
      onClick={handleBackdropClick}
    >
      <div className="glass-card w-full max-w-xl overflow-hidden">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Submit a Cat Card</h2>
            <p className="text-xs text-muted-foreground">Uploads stay pending until a moderator approves them.</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-border/50 bg-background/70 p-2 text-muted-foreground transition hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <form className="grid gap-4 px-6 py-6" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Season</span>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={seasonId}
              onChange={(event) => setSeasonId(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a season…
              </option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.season_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Cat name</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Moonshadow"
              value={catName}
              onChange={(event) => setCatName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Twitch username (or display name)</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Beastyrabbit"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Rarity</span>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2"
              value={rarityId}
              onChange={(event) => setRarityId(event.target.value)}
              required
            >
              <option value="" disabled>
                Select a rarity…
              </option>
              {rarities.map((rarity) => (
                <option key={rarity.id} value={rarity.id}>
                  {rarity.rarity_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Card number (optional)</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2"
              placeholder="Enter the official card number"
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Official card image</span>
            <input
              ref={defaultInputRef}
              className="rounded-lg border border-dashed border-border bg-background px-3 py-2"
              type="file"
              accept="image/png,image/jpeg"
              required
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setDefaultFile(file);
              }}
            />
            {defaultFile && (
              <span className="text-xs text-muted-foreground">Selected: {defaultFile.name}</span>
            )}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Custom art (optional)</span>
            <input
              ref={customInputRef}
              className="rounded-lg border border-dashed border-border bg-background px-3 py-2"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setCustomFile(file);
              }}
            />
            {customFile && (
              <span className="text-xs text-muted-foreground">Selected: {customFile.name}</span>
            )}
          </label>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit card"}
            </button>
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

function MassUploadModal({ onClose, seasons, rarities, onSubmit }: MassUploadModalProps) {
  const [owner, setOwner] = useState("");
  const [entries, setEntries] = useState<MassUploadEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaultInputRef = useRef<HTMLInputElement | null>(null);
  const entriesRef = useRef<MassUploadEntry[]>([]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    return () => {
      entriesRef.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    };
  }, []);

  const seasonOptions = seasons.map((season) => ({ id: season.id, label: season.season_name }));
  const rarityOptions = rarities.map((rarity) => ({ id: rarity.id, label: rarity.rarity_name }));
  const defaultSeason = seasonOptions[0]?.id ?? "";
  const defaultRarity = rarityOptions[0]?.id ?? "";

  const handleOwnerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOwner(event.target.value);
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const newEntries = files.map((file) => {
      const defaults = inferEntryDefaults(file.name);
      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        defaultFile: file,
        previewUrl: URL.createObjectURL(file),
        catName: defaults.name,
        cardNumber: defaults.number,
        seasonId: defaultSeason,
        rarityId: defaultRarity,
        customFile: null,
        status: "idle" as const,
        message: undefined
      };
    });
    setEntries((prev) => [...prev, ...newEntries]);
    setStatus(null);
    if (defaultInputRef.current) defaultInputRef.current.value = "";
  };

  const updateEntry = (id: string, updater: (entry: MassUploadEntry) => MassUploadEntry) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? updater(entry) : entry)));
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => {
      const entry = prev.find((item) => item.id === id);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleMassSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner.trim()) {
      setStatus("Please enter your Twitch username once for the batch.");
      return;
    }
    if (!entries.length) {
      setStatus("Select at least one official card image to upload.");
      return;
    }

    setBusy(true);
    setStatus("Uploading cards…");
    let success = 0;
    let failed = 0;

    for (const entry of entries) {
      const trimmedName = entry.catName.trim();
      const validationErrors: string[] = [];
      if (!trimmedName) validationErrors.push("Add the cat name.");
      if (trimmedName && !/^[A-Za-z0-9\s\-_'`]+$/.test(trimmedName)) {
        validationErrors.push("Cat name contains invalid characters.");
      }
      if (!entry.seasonId) validationErrors.push("Choose a season.");
      if (!entry.rarityId) validationErrors.push("Choose a rarity.");
      if (!entry.defaultFile) validationErrors.push("Missing default art.");

      if (validationErrors.length) {
        failed += 1;
        updateEntry(entry.id, (prev) => ({
          ...prev,
          status: "error",
          message: validationErrors.join(" ")
        }));
        continue;
      }

      updateEntry(entry.id, (prev) => ({ ...prev, status: "uploading", message: "Uploading…" }));

      try {
        await onSubmit({
          seasonId: entry.seasonId,
          rarityId: entry.rarityId,
          catName: trimmedName,
          owner,
          cardNumber: entry.cardNumber,
          defaultFile: entry.defaultFile,
          customFile: entry.customFile
        });
        success += 1;
        updateEntry(entry.id, (prev) => ({ ...prev, status: "success", message: "Uploaded" }));
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Upload failed.";
        updateEntry(entry.id, (prev) => ({ ...prev, status: "error", message }));
      }
    }

    if (failed === 0) {
      setStatus(`Uploaded ${success} card${success === 1 ? "" : "s"}.`);
      setEntries((prev) => {
        prev.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
        return [];
      });
      setOwner(owner);
    } else {
      const summary = [`${success} succeeded`, `${failed} failed`].join(", ");
      setStatus(summary);
    }

    setBusy(false);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-8"
      onClick={handleBackdropClick}
    >
      <div className="glass-card w-full max-w-5xl overflow-hidden">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Mass upload cards</h2>
            <p className="text-xs text-muted-foreground">
              Select multiple default images, add details, and we will queue each submission automatically.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-border/50 bg-background/70 p-2 text-muted-foreground transition hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <form className="grid gap-4 px-6 py-6" onSubmit={handleMassSubmit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Twitch username</span>
              <input
                className="rounded-lg border border-border bg-background px-3 py-2"
                placeholder="e.g., Beastyrabbit"
                value={owner}
                onChange={handleOwnerChange}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Official card images</span>
              <input
                ref={defaultInputRef}
                className="rounded-lg border border-dashed border-border bg-background px-3 py-2"
                type="file"
                accept="image/png,image/jpeg"
                multiple
                onChange={handleFileSelection}
              />
              <small className="text-xs text-muted-foreground">
                Hold the single submit button for five seconds to open this tool.
              </small>
            </label>
          </div>

          {entries.length > 0 ? (
            <div className="grid gap-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/50 bg-background/70 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="relative h-40 w-full md:w-40">
                      <Image
                        src={entry.previewUrl}
                        alt={entry.defaultFile.name}
                        fill
                        unoptimized
                        sizes="160px"
                        className="rounded-xl border border-border/40 bg-muted object-contain"
                      />
                    </div>
                    <div className="flex-1 space-y-3 text-sm">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-muted-foreground">Cat name</span>
                          <input
                            className="rounded-lg border border-border bg-background px-3 py-2"
                            value={entry.catName}
                            onChange={(event) =>
                              updateEntry(entry.id, (prev) => ({
                                ...prev,
                                catName: event.target.value,
                                status: prev.status === "error" ? "idle" : prev.status,
                                message: prev.status === "error" ? undefined : prev.message
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-muted-foreground">Card number (optional)</span>
                          <input
                            className="rounded-lg border border-border bg-background px-3 py-2"
                            value={entry.cardNumber}
                            onChange={(event) =>
                              updateEntry(entry.id, (prev) => ({
                                ...prev,
                                cardNumber: event.target.value
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-muted-foreground">Season</span>
                          <select
                            className="rounded-lg border border-border bg-background px-3 py-2"
                            value={entry.seasonId || defaultSeason}
                            onChange={(event) =>
                              updateEntry(entry.id, (prev) => ({
                                ...prev,
                                seasonId: event.target.value,
                                status: prev.status === "error" ? "idle" : prev.status,
                                message: prev.status === "error" ? undefined : prev.message
                              }))
                            }
                          >
                            <option value="" disabled>
                              Select a season…
                            </option>
                            {seasonOptions.map((season) => (
                              <option key={season.id} value={season.id}>
                                {season.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-muted-foreground">Rarity</span>
                          <select
                            className="rounded-lg border border-border bg-background px-3 py-2"
                            value={entry.rarityId || defaultRarity}
                            onChange={(event) =>
                              updateEntry(entry.id, (prev) => ({
                                ...prev,
                                rarityId: event.target.value,
                                status: prev.status === "error" ? "idle" : prev.status,
                                message: prev.status === "error" ? undefined : prev.message
                              }))
                            }
                          >
                            <option value="" disabled>
                              Select a rarity…
                            </option>
                            {rarityOptions.map((rarity) => (
                              <option key={rarity.id} value={rarity.id}>
                                {rarity.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-muted-foreground">Custom art (optional)</span>
                        <input
                          className="rounded-lg border border-dashed border-border bg-background px-3 py-2"
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            updateEntry(entry.id, (prev) => ({
                              ...prev,
                              customFile: file,
                              status: prev.status === "error" ? "idle" : prev.status,
                              message: prev.status === "error" ? undefined : prev.message
                            }));
                          }}
                        />
                        {entry.customFile && (
                          <span className="text-xs text-muted-foreground">Selected: {entry.customFile.name}</span>
                        )}
                      </label>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          className="rounded-full border border-red-500/60 bg-red-500/10 px-3 py-1 font-medium text-red-500 transition hover:bg-red-500/20"
                          onClick={() => removeEntry(entry.id)}
                        >
                          Remove
                        </button>
                        {entry.message && (
                          <span
                            className={cn(
                              "text-xs",
                              entry.status === "error"
                                ? "text-red-500"
                                : entry.status === "success"
                                  ? "text-emerald-500"
                                  : "text-muted-foreground"
                            )}
                          >
                            {entry.message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              Select your official card images to start building the queue.
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={busy || !entries.length}
              className="inline-flex items-center justify-center rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Uploading…" : "Upload all"}
            </button>
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

function CreditBanner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <a
        href="https://www.twitch.tv/itthatmeowed"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/90 px-4 py-2 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur transition hover:border-primary/60 hover:text-foreground"
      >
        <span>Cat cards illustrated by</span>
        <span className="text-primary">itthatmeowed</span>
      </a>
    </div>
  );
}

function seasonShortLabel(cat: CatdexPayload, fallback: string): string {
  const fromRaw = (cat.seasonRaw as { short_name?: string | null; season_name?: string | null } | null | undefined)
    ?.short_name;
  if (fromRaw && fromRaw.trim()) return fromRaw.trim();
  if (cat.seasonShort && cat.seasonShort.trim()) return cat.seasonShort.trim();
  const seasonName =
    ((cat.seasonRaw as { season_name?: string | null } | null | undefined)?.season_name ?? fallback) || fallback;
  return deriveSeasonShort(seasonName);
}

function deriveSeasonShort(seasonName: string | null | undefined): string {
  if (!seasonName) return "—";
  const trimmed = seasonName.trim();
  if (!trimmed) return "—";
  if (/^pending/i.test(trimmed)) return "Pending";
  const seasonMatch = trimmed.match(/season\s*(\d+)/i);
  if (seasonMatch) {
    return `S${seasonMatch[1]}`;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 4) {
    const acronym = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
    if (acronym.length >= 2) return acronym;
  }
  if (trimmed.length <= 6) return trimmed;
  return trimmed.slice(0, 6).toUpperCase();
}

function rarityShortLabel(rarity: string | null | undefined, stars: number | null | undefined): string {
  if (!rarity) return "—";
  const trimmed = rarity.trim();
  if (!trimmed) return "—";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  let acronym = "";
  if (parts.length >= 2) {
    acronym = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  }
  if (!acronym) {
    if (trimmed.length <= 3) acronym = trimmed.toUpperCase();
    else acronym = trimmed.slice(0, 3).toUpperCase();
  }
  if (stars && Number.isFinite(stars) && stars > 0) {
    return `${acronym} (${stars}⭐)`;
  }
  return acronym;
}
