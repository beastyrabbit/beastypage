"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderCatBatchV3 } from "@/lib/cat-v3/api";
import type { BatchFrameSource, BatchVariantPayload } from "@/lib/cat-v3/types";
import {
  ACCESSORY_EXCEPTIONS,
  type AccessoryException,
  LIFEGEN_ACCESSORY_EXAMPLES,
  NEW_ACCESSORY_POSES,
} from "./accessory-test-data";
import styles from "./lifegen-accessories.module.css";

const CAT_COLOURS = [
  { id: "LIGHTBROWN", label: "Sand" },
  { id: "SILVER", label: "Silver" },
  { id: "BLACK", label: "Black" },
] as const;

type ExampleEntry = {
  name: string;
};

type RenderStatus = "loading" | "ready" | "error";
type SectionId = "exceptions" | "examples";

function imageId(section: SectionId, index: number, poseId: string) {
  return `${section}:${index}:${poseId}`;
}

function buildVariants(
  section: SectionId,
  entries: readonly ExampleEntry[],
): BatchVariantPayload[] {
  return entries.flatMap((entry, index) =>
    NEW_ACCESSORY_POSES.map((pose) => ({
      id: imageId(section, index, pose.id),
      label: entry.name,
      group: section,
      poseName: pose.id,
      overrides: { accessories: [entry.name] },
    })),
  );
}

function sourcesById(sources: BatchFrameSource[] | undefined) {
  return Object.fromEntries(
    (sources ?? []).map((source) => [source.id, source.imageDataUrl]),
  );
}

const LIFEGEN_EXAMPLE_ENTRIES = LIFEGEN_ACCESSORY_EXAMPLES.map((name) => ({
  name,
}));

export function LifeGenAccessoryLab() {
  const [colour, setColour] =
    useState<(typeof CAT_COLOURS)[number]["id"]>("LIGHTBROWN");
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const variants = useMemo(
    () => [
      ...buildVariants("exceptions", ACCESSORY_EXCEPTIONS),
      ...buildVariants("examples", LIFEGEN_EXAMPLE_ENTRIES),
    ],
    [],
  );

  const renderAccessories = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);

    try {
      const result = await renderCatBatchV3({
        payload: {
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
          columns: NEW_ACCESSORY_POSES.length,
          includeBase: false,
          includeSources: true,
          tileSize: 50,
        },
      });

      if (requestId !== requestIdRef.current) return;
      const nextImages = sourcesById(result.sources);
      const missing = variants.filter((variant) => !nextImages[variant.id]);
      if (missing.length > 0) {
        throw new Error(
          `The renderer returned ${missing.length} incomplete accessory frames.`,
        );
      }

      setImages(nextImages);
      setStatus("ready");
    } catch (renderError) {
      if (requestId !== requestIdRef.current) return;
      setImages({});
      setStatus("error");
      setError(
        renderError instanceof Error
          ? renderError.message
          : "The accessory render failed.",
      );
    }
  }, [colour, variants]);

  useEffect(() => {
    void renderAccessories();
    return () => {
      requestIdRef.current += 1;
    };
  }, [renderAccessories]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <Link className={styles.backLink} href="/tests">
              <span aria-hidden="true">←</span> Test pages
            </Link>
            <h1>LifeGen accessory check</h1>
            <p>
              Compare each accessory across the three new ClanGen poses. Every
              preview uses the renderer&apos;s original 50 × 50 pixels at 4×
              scale.
            </p>
          </div>
          <dl className={styles.summary}>
            <div>
              <dt>Exceptions</dt>
              <dd>22 × 3</dd>
            </div>
            <div>
              <dt>Examples</dt>
              <dd>10 × 3</dd>
            </div>
            <div>
              <dt>Total frames</dt>
              <dd>96</dd>
            </div>
          </dl>
        </header>

        <div className={styles.toolbar}>
          <label htmlFor="accessory-cat-colour">Cat colour</label>
          <select
            id="accessory-cat-colour"
            value={colour}
            onChange={(event) =>
              setColour(
                event.target.value as (typeof CAT_COLOURS)[number]["id"],
              )
            }
          >
            {CAT_COLOURS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className={styles.renderState} data-status={status}>
            <span aria-hidden="true" />
            <span aria-live="polite">
              {status === "loading" ? "Rendering 96 frames" : null}
              {status === "ready" ? "All 96 frames ready" : null}
              {status === "error" ? "Renderer unavailable" : null}
            </span>
          </div>
        </div>

        {error ? (
          <section className={styles.errorPanel} role="alert">
            <div>
              <strong>Could not draw the accessory matrix.</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => void renderAccessories()}>
              Try again
            </button>
          </section>
        ) : null}

        <AccessoryMatrix
          section="exceptions"
          title="22 exceptions"
          description="Twenty preserved BeastyPage accessories needed new frames. Two public names now point to renamed LifeGen sprites."
          entries={ACCESSORY_EXCEPTIONS}
          images={images}
          loading={status === "loading"}
        />

        <AccessoryMatrix
          section="examples"
          title="10 current LifeGen examples"
          description="Ten accessories taken directly from the current LifeGen sheets. Each row repeats the same accessory on all three new poses."
          entries={LIFEGEN_EXAMPLE_ENTRIES}
          images={images}
          loading={status === "loading"}
        />

        <footer className={styles.footer}>
          This page calls the local renderer. It uses nearest-neighbour scaling
          and no generated images.
        </footer>
      </div>
    </main>
  );
}

function AccessoryMatrix({
  section,
  title,
  description,
  entries,
  images,
  loading,
}: {
  section: SectionId;
  title: string;
  description: string;
  entries: readonly ExampleEntry[];
  images: Record<string, string>;
  loading: boolean;
}) {
  return (
    <section className={styles.matrixSection}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>{entries.length} accessories</span>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">Accessory</th>
              {NEW_ACCESSORY_POSES.map((pose) => (
                <th scope="col" key={pose.id}>
                  <span>{pose.label}</span>
                  <code>{pose.id}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.name}>
                <th scope="row">
                  <span className={styles.rowNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{entry.name}</strong>
                  {isException(entry) ? (
                    <span className={styles.exceptionMeta}>
                      {entry.kind === "adapted" ? "Adapted with" : "Renamed to"}
                      <code>{entry.source}</code>
                    </span>
                  ) : (
                    <span className={styles.exampleMeta}>Current LifeGen</span>
                  )}
                </th>
                {NEW_ACCESSORY_POSES.map((pose) => {
                  const id = imageId(section, index, pose.id);
                  const imageDataUrl = images[id];
                  return (
                    <td key={pose.id} data-loading={loading}>
                      <div className={styles.spriteStage}>
                        {imageDataUrl ? (
                          <Image
                            src={imageDataUrl}
                            alt={`${entry.name} accessory on ${pose.id}`}
                            width={200}
                            height={200}
                            unoptimized
                          />
                        ) : (
                          <div
                            className={styles.spritePlaceholder}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isException(entry: ExampleEntry): entry is AccessoryException {
  return "kind" in entry;
}
