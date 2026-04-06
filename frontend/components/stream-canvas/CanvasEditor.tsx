"use client";

import { useAuth } from "@clerk/nextjs";
import { useSync } from "@tldraw/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type TLAssetStore,
  type TLComponents,
  Tldraw,
  useEditor,
} from "tldraw";
import "tldraw/tldraw.css";
import { buildEditorWsUrl, uploadFile } from "@/lib/stream-canvas/api";
import { STREAM_ZONE } from "@/lib/stream-canvas/stream-zone";

interface CanvasEditorProps {
  roomId: string;
  twitchChannel?: string | null;
}

/**
 * Custom Background that renders the Twitch embed and stream zone indicator
 * inside tldraw's background layer (behind shapes, moves with camera).
 * OBS mirror sets Background: null, so none of this shows there.
 */
function CanvasBackground({ channel }: { channel?: string | null }) {
  const editor = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const [interactMode, setInteractMode] = useState(false);

  useEffect(() => {
    function update() {
      if (!containerRef.current) return;
      const { x, y, z } = editor.getCamera();
      const screenX = STREAM_ZONE.x * z + x;
      const screenY = STREAM_ZONE.y * z + y;
      containerRef.current.style.transform = `translate(${screenX}px, ${screenY}px) scale(${z})`;
    }

    const dispose = editor.store.listen(update, {
      source: "all",
      scope: "session",
    });
    update();
    return dispose;
  }, [editor]);

  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = hostname.endsWith(".localhost") || hostname === "localhost";

  return (
    <>
      {/* Default background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--tl-color-background)",
        }}
      />
      {/* Stream zone + Twitch embed — positioned in canvas coordinates */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: STREAM_ZONE.width,
          height: STREAM_ZONE.height,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      >
        {/* Twitch embed */}
        {channel && (
          <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
            {isLocal ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.85)",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "14px",
                  fontFamily: "sans-serif",
                  borderRadius: "4px",
                }}
              >
                Twitch embed disabled on localhost
                <span style={{ fontSize: "12px", opacity: 0.6 }}>
                  twitch.tv/{channel}
                </span>
              </div>
            ) : (
              <iframe
                src={`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${hostname}&muted=true`}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderRadius: "4px",
                  pointerEvents: interactMode ? "auto" : "none",
                }}
                allowFullScreen
                title={`${channel} Twitch stream`}
              />
            )}
          </div>
        )}
        {/* Stream zone border */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "2px dashed rgba(59, 130, 246, 0.5)",
            borderRadius: "4px",
          }}
        />
        {/* Stream zone label */}
        <span
          style={{
            position: "absolute",
            top: "-24px",
            left: "8px",
            fontSize: "12px",
            color: "rgba(59, 130, 246, 0.8)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          Stream Zone (1920×1080)
        </span>
        {channel && (
          <button
            type="button"
            onClick={() => setInteractMode((prev: boolean) => !prev)}
            style={{
              position: "absolute",
              top: "-24px",
              right: "8px",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "3px",
              border: "1px solid rgba(59, 130, 246, 0.5)",
              background: interactMode
                ? "rgba(59, 130, 246, 0.2)"
                : "transparent",
              color: "rgba(59, 130, 246, 0.8)",
              cursor: "pointer",
              pointerEvents: "auto",
              userSelect: "none",
            }}
          >
            {interactMode ? "Back to drawing" : "Interact with stream"}
          </button>
        )}
      </div>
    </>
  );
}

/** Clean up leftover stream zone frame shapes from pre-release prototype. */
function LegacyCleanup() {
  const editor = useEditor();

  useEffect(() => {
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.meta?.isStreamZone) {
        editor.deleteShape(shape.id);
      }
    }
  }, [editor]);

  return null;
}

export function CanvasEditor({ roomId, twitchChannel }: CanvasEditorProps) {
  const { getToken } = useAuth();

  const getUri = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    return buildEditorWsUrl(roomId, token);
  }, [roomId, getToken]);

  const assets = useMemo<TLAssetStore>(
    () => ({
      async upload(_asset, file) {
        const result = await uploadFile(roomId, file, getToken);
        const apiBase =
          process.env.NEXT_PUBLIC_CANVAS_API_URL ??
          "https://stream-canvas.localhost:1355";
        return { src: `${apiBase}${result.url}` };
      },
      resolve(asset) {
        return asset.props.src ?? null;
      },
    }),
    [roomId, getToken],
  );

  const components = useMemo<TLComponents>(
    () => ({
      Background: () => <CanvasBackground channel={twitchChannel} />,
    }),
    [twitchChannel],
  );

  const storeWithStatus = useSync({ uri: getUri, assets });

  if (storeWithStatus.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Connecting…
      </div>
    );
  }

  if (storeWithStatus.status === "error") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        Connection error: {storeWithStatus.error.message}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Tldraw store={storeWithStatus.store} components={components}>
        <LegacyCleanup />
      </Tldraw>
    </div>
  );
}
