"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderCatBatchV3 } from "@/lib/cat-v3/api";
import { COAT_PATTERNS, type CoatPatternId } from "@/lib/cat-v3/coatPatterns";
import type { BatchFrameSource, BatchVariantPayload } from "@/lib/cat-v3/types";
import styles from "./coat-patterns.module.css";

const COLOURS = [
  { id: "GOLDEN", label: "Golden", swatch: "#d39a43" },
  { id: "GINGER", label: "Ginger", swatch: "#c96632" },
  { id: "LIGHTBROWN", label: "Sand", swatch: "#b18b68" },
  { id: "BROWN", label: "Brown", swatch: "#76503b" },
  { id: "SILVER", label: "Silver", swatch: "#b9bcc0" },
] as const;

const POSES = [
  { id: "adult_short0", label: "Walk" },
  { id: "adult_short1", label: "Sit" },
  { id: "adult_short2", label: "Turn" },
] as const;

type RenderStatus = "idle" | "loading" | "ready" | "error";

function sourcesById(sources: BatchFrameSource[] | undefined) {
  return Object.fromEntries(
    (sources ?? []).map((source) => [source.id, source.imageDataUrl]),
  );
}

export function CoatPatternLab() {
  const [colour, setColour] =
    useState<(typeof COLOURS)[number]["id"]>("GOLDEN");
  const [pose, setPose] =
    useState<(typeof POSES)[number]["id"]>("adult_short1");
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const variants = useMemo<BatchVariantPayload[]>(
    () =>
      COAT_PATTERNS.map((pattern) => ({
        id: pattern.id,
        label: pattern.name,
        group: "experimental",
        overrides: { coatPattern: pattern.id },
      })),
    [],
  );

  const renderPatterns = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);

    try {
      const result = await renderCatBatchV3({
        payload: {
          poseName: pose,
          params: {
            peltName: "SingleColour",
            colour,
            isTortie: false,
            shading: true,
            reverse: false,
            accessories: [],
            scars: [],
            eyeColour: "PALEGREEN",
            skinColour: "DARKBROWN",
          },
        },
        variants,
        options: {
          columns: 4,
          includeBase: false,
          includeSources: true,
          tileSize: 50,
        },
      });

      if (requestId !== requestIdRef.current) return;
      const nextImages = sourcesById(result.sources);
      const patternImages = COAT_PATTERNS.map(
        (pattern) => nextImages[pattern.id],
      );
      if (patternImages.some((image) => !image)) {
        throw new Error("The renderer returned an incomplete pattern set.");
      }
      if (new Set(patternImages).size !== COAT_PATTERNS.length) {
        throw new Error("The renderer does not support this pattern set yet.");
      }
      setImages(nextImages);
      setStatus("ready");
    } catch (renderError) {
      if (requestId !== requestIdRef.current) return;
      setImages({});
      setError(
        renderError instanceof Error
          ? renderError.message
          : "The pattern render failed.",
      );
      setStatus("error");
    }
  }, [colour, pose, variants]);

  useEffect(() => {
    void renderPatterns();
    return () => {
      requestIdRef.current += 1;
    };
  }, [renderPatterns]);

  const retry = useCallback(() => {
    void renderPatterns();
  }, [renderPatterns]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <Link className={styles.backLink} href="/tests">
              <span aria-hidden="true">←</span> Test pages
            </Link>
            <h1>20 new coat patterns</h1>
            <p>
              One large cat per pattern. Every 50 × 50 source sprite is shown at
              5× size with hard pixel edges.
            </p>
          </div>
          <dl className={styles.specs}>
            <div>
              <dt>Source</dt>
              <dd>50 × 50 px</dd>
            </div>
            <div>
              <dt>Preview</dt>
              <dd>250 × 250 px</dd>
            </div>
            <div>
              <dt>Patterns</dt>
              <dd>20 new</dd>
            </div>
          </dl>
        </header>

        <section className={styles.toolbar} aria-label="Cat preview controls">
          <fieldset>
            <legend>Coat colour</legend>
            <div className={styles.swatchRow}>
              {COLOURS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={styles.swatchButton}
                  data-active={colour === option.id}
                  aria-pressed={colour === option.id}
                  onClick={() => setColour(option.id)}
                >
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: option.swatch }}
                    aria-hidden="true"
                  />
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Pose</legend>
            <div className={styles.poseRow}>
              {POSES.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  data-active={pose === option.id}
                  aria-pressed={pose === option.id}
                  onClick={() => setPose(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.renderState} data-status={status}>
            <span className={styles.statusLight} aria-hidden="true" />
            <span aria-live="polite">
              {status === "loading" ? "Rendering" : null}
              {status === "ready" ? "Ready" : null}
              {status === "error" ? "Renderer unavailable" : null}
              {status === "idle" ? "Waiting" : null}
            </span>
          </div>
        </section>

        {error ? (
          <section className={styles.errorPanel} role="alert">
            <div>
              <strong>Could not draw the cats.</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </section>
        ) : null}

        <section className={styles.patternSection}>
          <div className={styles.sectionHeading}>
            <h2>Patterns 01 to 20</h2>
            <p>No original coats in this grid.</p>
          </div>

          <div className={styles.patternGrid}>
            {COAT_PATTERNS.map((pattern, index) => (
              <PatternCard
                key={pattern.id}
                id={pattern.id}
                index={index}
                name={pattern.name}
                note={pattern.note}
                imageDataUrl={images[pattern.id]}
                sourcePelts={pattern.sourcePelts}
                pose={pose}
                loading={status === "loading"}
              />
            ))}
          </div>
        </section>

        <footer className={styles.footerNote}>
          <span aria-hidden="true" className={styles.pixelMark} />
          These are renderer-made 50 × 50 sprites. The page uses
          nearest-neighbour scaling and no generated images.
        </footer>
      </div>
    </main>
  );
}

function PatternCard({
  id,
  index,
  name,
  note,
  imageDataUrl,
  sourcePelts,
  pose,
  loading,
}: {
  id: CoatPatternId;
  index: number;
  name: string;
  note: string;
  imageDataUrl?: string;
  sourcePelts: readonly string[];
  pose: string;
  loading: boolean;
}) {
  return (
    <article className={styles.patternCard} data-loading={loading}>
      <header>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <h3>{name}</h3>
      </header>
      <div className={styles.spriteStage}>
        {imageDataUrl ? (
          <Image
            src={imageDataUrl}
            alt={`${name} coat pattern in the ${pose.replaceAll("_", " ")} pose`}
            width={250}
            height={250}
            unoptimized
          />
        ) : (
          <div className={styles.spritePlaceholder} aria-hidden="true" />
        )}
      </div>
      <div className={styles.cardCopy}>
        <p>{note}</p>
        <div className={styles.cardMeta}>
          <code>{id}</code>
          <span>Frames: {sourcePelts.join(" + ")}</span>
        </div>
      </div>
    </article>
  );
}
