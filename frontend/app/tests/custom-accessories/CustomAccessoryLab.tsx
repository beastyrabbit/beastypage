"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderCatBatchV3 } from "@/lib/cat-v3/api";
import type { BatchFrameSource, BatchVariantPayload } from "@/lib/cat-v3/types";
import styles from "./custom-accessories.module.css";
import {
  CUSTOM_ACCESSORIES,
  CUSTOM_ACCESSORY_POSE_GROUPS,
  CUSTOM_ACCESSORY_POSES,
} from "./custom-accessory-test-data";

const CAT_COLOURS = [
  { id: "LIGHTBROWN", label: "Sand" },
  { id: "SILVER", label: "Silver" },
  { id: "BLACK", label: "Black" },
] as const;

type RenderStatus = "loading" | "ready" | "error";

function imageId(accessoryId: string, poseName: string) {
  return `${accessoryId}:${poseName}`;
}

function sourcesById(sources: BatchFrameSource[] | undefined) {
  return Object.fromEntries(
    (sources ?? []).map((source) => [source.id, source.imageDataUrl]),
  );
}

export function CustomAccessoryLab() {
  const fitCheckCount =
    CUSTOM_ACCESSORIES.length * CUSTOM_ACCESSORY_POSES.length;
  const [colour, setColour] =
    useState<(typeof CAT_COLOURS)[number]["id"]>("LIGHTBROWN");
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const variants = useMemo<BatchVariantPayload[]>(
    () =>
      CUSTOM_ACCESSORIES.flatMap((accessory) =>
        CUSTOM_ACCESSORY_POSES.map((poseName) => ({
          id: imageId(accessory.id, poseName),
          label: accessory.name,
          group: accessory.id,
          poseName,
          overrides: { accessories: [accessory.name] },
        })),
      ),
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
          columns: 3,
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
            <p className={styles.eyebrow}>Original pixel accessories</p>
            <h1>Custom accessory fit check</h1>
            <p className={styles.intro}>
              Three hand-built accessories on every named cat pose. Object size
              stays fixed while the placement, direction, and visible
              perspective follow each cat. Newborn and sick cats keep the object
              beside them.
            </p>
          </div>
          <dl className={styles.summary}>
            <div>
              <dt>Accessories</dt>
              <dd>{CUSTOM_ACCESSORIES.length}</dd>
            </div>
            <div>
              <dt>Named poses</dt>
              <dd>26</dd>
            </div>
            <div>
              <dt>Fit checks</dt>
              <dd>{fitCheckCount}</dd>
            </div>
          </dl>
        </header>

        <div className={styles.toolbar}>
          <label htmlFor="custom-accessory-cat-colour">Cat colour</label>
          <select
            id="custom-accessory-cat-colour"
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
              {status === "loading"
                ? `Rendering ${fitCheckCount} frames`
                : null}
              {status === "ready" ? `All ${fitCheckCount} frames ready` : null}
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

        <nav className={styles.poseNav} aria-label="Pose groups">
          {CUSTOM_ACCESSORY_POSE_GROUPS.map((group) => (
            <a key={group.id} href={`#${group.id}`}>
              {group.label}
            </a>
          ))}
        </nav>

        {CUSTOM_ACCESSORY_POSE_GROUPS.map((group) => (
          <section
            className={styles.matrixSection}
            id={group.id}
            key={group.id}
          >
            <div className={styles.sectionHeading}>
              <div>
                <p>{String(group.poses.length).padStart(2, "0")} poses</p>
                <h2>{group.label}</h2>
              </div>
              <span>native 50 × 50 · display 4×</span>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.matrix}>
                <thead>
                  <tr>
                    <th scope="col">Accessory</th>
                    {group.poses.map((poseName) => (
                      <th scope="col" key={poseName}>
                        <span>{poseName.replaceAll("_", " ")}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CUSTOM_ACCESSORIES.map((accessory, index) => (
                    <tr key={accessory.id}>
                      <th scope="row">
                        <span className={styles.rowNumber}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <strong>{accessory.name}</strong>
                        <small>{accessory.note}</small>
                      </th>
                      {group.poses.map((poseName) => {
                        const source = images[imageId(accessory.id, poseName)];
                        return (
                          <td
                            key={poseName}
                            data-loading={status === "loading"}
                          >
                            <div className={styles.spriteStage}>
                              {source ? (
                                <Image
                                  src={source}
                                  alt={`${accessory.name} on ${poseName}`}
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
        ))}

        <footer className={styles.footer}>
          Final sprite pixels are deterministic hand-built primitives. AI
          references are not included in the sprite sheet.
        </footer>
      </div>
    </main>
  );
}
