"use client";

import { useSync } from "@tldraw/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tldraw,
  type TLAssetStore,
  type TLComponents,
  useEditor,
} from "tldraw";
import "tldraw/tldraw.css";
import { buildObsWsUrl, exchangeObsToken } from "@/lib/stream-canvas/api";
import { STREAM_ZONE } from "@/lib/stream-canvas/stream-zone";

interface CanvasMirrorProps {
  /** The long-lived OBS bootstrap secret from the URL. */
  obsSecret: string;
}

/** Disable tldraw's background and grid for OBS transparency. */
const obsComponents: TLComponents = {
  Background: null,
  Grid: null,
};

/** Lock the camera to the stream zone and hide the stream zone frame. */
function OBSSetup() {
  const editor = useEditor();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Lock camera to the stream zone
    editor.setCamera({
      x: -STREAM_ZONE.x,
      y: -STREAM_ZONE.y,
      z: 1,
    });

    const disposeCamera = editor.sideEffects.registerBeforeChangeHandler(
      "camera",
      (_prev, next) => ({
        ...next,
        x: -STREAM_ZONE.x,
        y: -STREAM_ZONE.y,
        z: 1,
      }),
    );

    return () => {
      disposeCamera();
    };
  }, [editor]);

  return null;
}

export function CanvasMirror({ obsSecret }: CanvasMirrorProps) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Verify the secret is valid on mount
  useEffect(() => {
    let cancelled = false;
    exchangeObsToken(obsSecret)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [obsSecret]);

  // Build the WS URL using a fresh short-lived token on each (re)connection
  const getUri = useCallback(async () => {
    const data = await exchangeObsToken(obsSecret);
    return buildObsWsUrl(data.roomId, data.token);
  }, [obsSecret]);

  // OBS mirror doesn't upload — resolve assets by returning their src
  const assets = useMemo<TLAssetStore>(
    () => ({
      async upload() {
        throw new Error("OBS mirror is read-only");
      },
      resolve(asset) {
        return asset.props.src ?? null;
      },
    }),
    [],
  );

  const storeWithStatus = useSync({ uri: getUri, assets });

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (!ready || storeWithStatus.status === "loading") {
    return null; // Transparent — nothing to show while connecting
  }

  if (storeWithStatus.status === "error") {
    return null; // Transparent on error — OBS shouldn't show error text
  }

  return (
    <div
      className="obs-mirror"
      style={{
        width: STREAM_ZONE.width,
        height: STREAM_ZONE.height,
        background: "transparent",
        overflow: "hidden",
        position: "fixed",
        inset: 0,
      }}
    >
      <Tldraw
        store={storeWithStatus.store}
        hideUi
        components={obsComponents}
      >
        <OBSSetup />
      </Tldraw>
    </div>
  );
}
