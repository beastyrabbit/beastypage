"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { AdoptionMetadataPanel, AdoptionMetadata } from "@/components/adoption/AdoptionMetadataPanel";
import type { Id } from "@/convex/_generated/dataModel";

interface LegacyBatchCat {
  label?: string | null;
  index?: number | null;
  encoded?: string | null;
  catData: unknown;
  shareToken?: string | null;
  profileId?: string | null;
  catName?: string | null;
  creatorName?: string | null;
}

interface LegacyBatchPayload {
  token?: unknown;
  cats?: LegacyBatchCat[];
  settings?: Record<string, unknown> | null;
  totalFinalCats?: number;
  createdAt?: number;
}

type AdoptionCatPayload = {
  label: string;
  catData: unknown;
  profileId?: string;
  encoded?: string;
  shareToken?: string;
  catName?: string;
  creatorName?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AFTERLIFE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "dark10", label: "Dark Forest 10%" },
  { value: "star10", label: "StarClan 10%" },
  { value: "both10", label: "Both 10%" },
  { value: "darkForce", label: "Always Dark Forest" },
  { value: "starForce", label: "Always StarClan" },
];

const SPEED_OPTIONS = [
  { value: "fast", label: "Fast" },
  { value: "normal", label: "Normal" },
  { value: "slow", label: "Chill" },
];

const LegacyCatGrid = memo(
  function LegacyCatGrid() {
    return <div id="catGrid" className="cat-grid" aria-live="polite" />;
  },
  () => true
);

export function AdoptionGeneratorClient() {
  const createBatch = useMutation(api.adoption.createBatch);
  const createMapper = useMutation(api.mapper.create);
  const updateBatchMeta = useMutation(api.adoption.updateBatchMeta);
  const stylesheetRef = useRef<HTMLLinkElement | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedToken, setLastSavedToken] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [savedMetadata, setSavedMetadata] = useState<AdoptionMetadata>({ title: "", creator: "" });
  const savedMetadataRef = useRef<AdoptionMetadata>(savedMetadata);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [speed, setSpeed] = useState<string>("normal");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const attr = "data-adoption-css";
    const existing = document.querySelector<HTMLLinkElement>(`link[${attr}]`);
    if (existing) {
      stylesheetRef.current = existing;
      return () => {
        stylesheetRef.current = null;
      };
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/assets/styles/pages/adoption-generator.css";
    link.setAttribute(attr, "true");
    document.head.appendChild(link);
    stylesheetRef.current = link;
    return () => {
      stylesheetRef.current?.remove();
      stylesheetRef.current = null;
    };
  }, []);

  useEffect(() => {
    savedMetadataRef.current = savedMetadata;
  }, [savedMetadata]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [{ createAdoptionGenerator }] = await Promise.all([
        import("@/lib/adoption/adoptionGenerator"),
      ]);
      if (cancelled) return;

      createAdoptionGenerator({
        viewerBasePath: "/view",
        onGenerationStart: () => {
          setGenerationComplete(false);
          const reset: AdoptionMetadata = { title: "", creator: "" };
          setSavedMetadata(reset);
          savedMetadataRef.current = reset;
          setMetadataMessage(null);
          setMetadataError(null);
          setMetadataSaving(false);
          setSaveState("idle");
          setLastSavedToken(null);
          setLastSavedAt(null);
          setLastSavedId(null);
        },
        onRevealComplete: () => {
          setGenerationComplete(true);
        },
        onBatchFinalized: async (payload: LegacyBatchPayload) => {
          if (!payload?.cats?.length) return;
          const payloadToken = typeof payload.token === "string" ? payload.token : null;
          if (payloadToken && payloadToken === lastTokenRef.current) {
            return;
          }
          lastTokenRef.current = payloadToken;
          setSaveState("saving");
          try {
            const catsPayload: AdoptionCatPayload[] = await Promise.all(
              payload.cats.map(async (cat, index) => {
                const label = cat.label?.trim() ? cat.label : `Cat ${index + 1}`;
                const encoded = typeof cat.encoded === "string" ? cat.encoded : undefined;
                let shareToken = typeof cat.shareToken === "string" ? cat.shareToken : undefined;
                let profileId = typeof cat.profileId === "string" ? cat.profileId : undefined;

                if (!shareToken || !profileId) {
                  try {
                    const mapperResult = await createMapper({
                      catData: cat.catData,
                      catName: cat.catName ?? undefined,
                      creatorName: cat.creatorName ?? undefined,
                    });
                    if (mapperResult && typeof mapperResult === "object") {
                      const mapperPayload = mapperResult as {
                        id: string;
                        shareToken?: string | null;
                        slug?: string | null;
                      };
                      shareToken = shareToken ?? mapperPayload.shareToken ?? mapperPayload.slug ?? mapperPayload.id;
                      profileId = profileId ?? mapperPayload.id;
                    }
                  } catch (error) {
                    console.warn("Failed to persist adoption cat", error);
                  }
                }

                return {
                  label,
                  catData: cat.catData,
                  profileId,
                  encoded,
                  shareToken,
                  catName: cat.catName ?? undefined,
                  creatorName: cat.creatorName ?? undefined,
                } satisfies AdoptionCatPayload;
              })
            );

            const currentMeta = savedMetadataRef.current;
            const settingsPayload = {
              ...(payload.settings ?? {}),
              totalFinalCats: payload.totalFinalCats ?? payload.cats.length,
              generatedAt: payload.createdAt ?? Date.now(),
              source: "adoption-generator",
              batchTitle: currentMeta.title,
              batchCreator: currentMeta.creator,
            };

            const result = await createBatch({
              cats: catsPayload,
              settings: settingsPayload,
              title: currentMeta.title,
              creatorName: currentMeta.creator,
            });

            if (result?.shareToken || result?.slug) {
              const token = (result as { shareToken?: string }).shareToken ?? result.slug ?? null;
              setLastSavedToken(token);
              setLastSavedAt(Date.now());
              setLastSavedId(result.id ?? null);
            }
            setMetadataError(null);
            setMetadataMessage(null);
            setSaveState("saved");
          } catch (error) {
            console.error("Failed to save adoption batch", error);
            setSaveState("error");
            setMetadataError("Failed to save batch.");
          }
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [createBatch, createMapper]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const group = document.getElementById("speedGroup");
    if (!group) return;
    group.setAttribute("data-value", speed);
    const detail = { value: speed };
    group.dispatchEvent(new CustomEvent("sl-change", { detail, bubbles: true }));
  }, [speed]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeout = window.setTimeout(() => {
      setSaveState("idle");
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    if (!metadataMessage) return;
    const timeout = window.setTimeout(() => setMetadataMessage(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [metadataMessage]);

  const handleMetadataSave = useCallback(async (nextMetadata: AdoptionMetadata) => {
    if (!lastSavedId) {
      setMetadataError("Save the batch first.");
      return;
    }
    const dirty = nextMetadata.title !== savedMetadata.title || nextMetadata.creator !== savedMetadata.creator;
    if (!dirty) {
      setMetadataMessage("Nothing to save");
      return;
    }
    try {
      setMetadataSaving(true);
      setMetadataMessage(null);
      setMetadataError(null);
      await updateBatchMeta({
        id: lastSavedId as Id<"adoption_batch">,
        title: nextMetadata.title,
        creatorName: nextMetadata.creator,
      });
      setSavedMetadata(nextMetadata);
      savedMetadataRef.current = nextMetadata;
      setMetadataMessage("Saved");
    } catch (error) {
      console.error("Failed to save metadata", error);
      setMetadataError("Failed to save metadata.");
    } finally {
      setMetadataSaving(false);
    }
  }, [lastSavedId, savedMetadata, updateBatchMeta]);

  const statusNode = (() => {
    switch (saveState) {
      case "saving":
        return (
          <span className="inline-flex items-center gap-2 text-sm text-amber-200">
            <Loader2 className="size-4 animate-spin" /> Saving adoption batch…
          </span>
        );
      case "saved":
        return (
          <span className="inline-flex items-center gap-2 text-sm text-emerald-200">
            <CheckCircle2 className="size-4" />
            <span className="inline-flex items-center gap-1">
              Saved to history
              {lastSavedToken ? (
                <>
                  :{" "}
                  <Link href={`/adoption/${lastSavedToken}`} className="inline-flex items-center gap-1 underline">
                    view batch <ExternalLink className="size-3" />
                  </Link>
                </>
              ) : null}
            </span>
            {lastSavedAt ? (
              <span className="text-xs text-emerald-100/80">({new Date(lastSavedAt).toLocaleTimeString()})</span>
            ) : null}
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-2 text-sm text-red-200">
            <AlertTriangle className="size-4" /> Failed to save batch. Try again after regenerating.
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="adoption-generator">
      <main className="page-wrapper">
        <header className="page-header">
          <h1>Adoption Generator</h1>
          <p className="page-subtitle">
            Roll a full litter at once, prune after every reveal, and finish with ten finalists.
          </p>
          <div className="stage-info">
            <span id="stageStatus" className="stage-status">
              Select your options and generate to begin.
            </span>
            <span className="stage-count">
              Cats Remaining: <strong id="catCountDisplay">—</strong>
            </span>
          </div>
          {statusNode}
        </header>

        <section className="controls-panel">
          <div className="controls-left">
            <button id="generateButton" className="generate-button" type="button">
              Generate Adoption
            </button>
              <div className="sl-toggle-group">
                <span className="setting-label">Speed:</span>
                <div id="speedGroup" className="sl-segment" data-value={speed}>
                  {SPEED_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-speed-option
                      data-value={option.value}
                      aria-pressed={speed === option.value}
                      className={`palette-toggle${speed === option.value ? " active" : ""}`}
                      onClick={() => setSpeed(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          <div className="controls-right">
            <div className="control-row">
              <span className="toggle-label">Layer Counts:</span>
              <label className="select-label" htmlFor="accCount">
                Accessories
                <div className="select-wrap">
                  <div className="select-inner">
                    <select id="accCount" defaultValue="2">
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                </div>
              </label>
              <label className="select-label" htmlFor="scarCount">
                Scars
                <div className="select-wrap">
                  <div className="select-inner">
                    <select id="scarCount" defaultValue="2">
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                </div>
              </label>
              <label className="select-label" htmlFor="tortieCount">
                Tortie Layers
                <div className="select-wrap">
                  <div className="select-inner">
                    <select id="tortieCount" defaultValue="2">
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                </div>
              </label>
            </div>
            <div className="control-row">
              <span className="toggle-label">Alignment:</span>
              <label className="select-label" htmlFor="afterlifeMode">
                Afterlife Effects
                <div className="select-wrap">
                  <div className="select-inner">
                    <select id="afterlifeMode" defaultValue="both10">
                      {AFTERLIFE_OPTIONS.map((option) => (
                        <option key={`afterlife-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </label>
            </div>
            <div className="control-row palette-toggle-row" id="extendedPaletteControls">
              <span className="setting-label">Additional Colors:</span>
              <div className="palette-toggle-buttons">
                <button type="button" className="palette-toggle active" data-extended-mode="base" aria-pressed="true">
                  Base
                </button>
                <button type="button" className="palette-toggle" data-extended-mode="mood" aria-pressed="false">
                  Mood
                </button>
                <button type="button" className="palette-toggle" data-extended-mode="bold" aria-pressed="false">
                  Bold
                </button>
                <button type="button" className="palette-toggle" data-extended-mode="darker" aria-pressed="false">
                  Darker
                </button>
                <button type="button" className="palette-toggle" data-extended-mode="blackout" aria-pressed="false">
                  Blackout
                </button>
                <button type="button" className="palette-reset" data-extended-reset>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid-panel">
          <LegacyCatGrid />
          <p className="removal-tip" id="removalTip">
            Hover a cat to cull it when prompted.
          </p>
        </section>

        {generationComplete ? (
          <section className="mt-4 flex flex-col gap-3">
            <AdoptionMetadataPanel
              savedValue={savedMetadata}
              onSave={handleMetadataSave}
              busy={metadataSaving}
              message={metadataMessage ?? undefined}
              error={metadataError}
              canSave={!!lastSavedId}
            />
            {lastSavedToken ? (
              <Link
                href={`/adoption/${lastSavedToken}`}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide transition hover:bg-foreground hover:text-background"
              >
                Open batch page
              </Link>
            ) : null}
          </section>
        ) : null}
      </main>
      <div id="catDetailOverlay" className="cat-detail-overlay" aria-hidden="true">
        <div className="overlay-backdrop" data-overlay-close />
        <div className="overlay-content" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
          <button className="overlay-close" type="button" data-overlay-close title="Close">
            ✕
          </button>
          <div className="overlay-body">
            <div className="overlay-main">
              <div className="overlay-canvas-wrap">
                <canvas id="detailCanvas" width="700" height="700" />
              </div>
              <div className="overlay-panel">
                <h2 id="detailTitle">Cat</h2>
                <div id="detailTable" className="detail-table overlay-parameter-table" />
                <div className="overlay-actions overlay-actions-row flex flex-wrap gap-2">
                  <button id="detailCopyBig" type="button" className="overlay-action-btn">
                    Copy 700×700
                  </button>
                  <button id="detailCopyShare" type="button" className="overlay-action-btn">
                    Copy share URL
                  </button>
                  <button id="detailOpenViewer" type="button" className="overlay-action-btn">
                    Open in viewer
                  </button>
                  <button id="detailOpenSprites" type="button" className="overlay-action-btn">
                    View sprite gallery
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="spriteGalleryOverlay" className="cat-detail-overlay sprite-gallery-overlay" aria-hidden="true">
        <div className="overlay-backdrop" data-sprite-gallery-close />
        <div className="overlay-content" role="dialog" aria-modal="true" aria-labelledby="spriteGalleryTitle">
          <button className="overlay-close" type="button" data-sprite-gallery-close title="Close">
            ✕
          </button>
          <div className="overlay-body">
            <div className="overlay-variants">
              <div className="overlay-variants-header">
                <h3 id="spriteGalleryTitle">Sprite Gallery</h3>
                <p>Preview every pose and copy exports instantly.</p>
              </div>
              <div id="spriteGalleryGrid" className="overlay-sprites-grid" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
