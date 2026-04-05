"use client";

import { useAuth } from "@clerk/nextjs";
import { useSync } from "@tldraw/sync";
import { useCallback, useEffect, useMemo } from "react";
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
 * Custom Background component that renders:
 * 1. The default canvas background color
 * 2. The Twitch stream embed at the stream zone position
 * 3. The stream zone border indicator
 *
 * All in canvas coordinates — tldraw handles pan/zoom transforms.
 * OBS mirror uses `Background: null` so none of this shows there.
 */
function CanvasBackground({ channel }: { channel?: string | null }) {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = hostname.endsWith(".localhost") || hostname === "localhost";

  return (
    <>
      {/* Default background fill */}
      <rect
        x={-10000}
        y={-10000}
        width={20000}
        height={20000}
        fill="var(--tl-color-background)"
      />

      {/* Twitch embed via foreignObject — positioned at stream zone in canvas coords */}
      {channel && (
        <foreignObject
          x={STREAM_ZONE.x}
          y={STREAM_ZONE.y}
          width={STREAM_ZONE.width}
          height={STREAM_ZONE.height}
        >
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
              }}
              allowFullScreen
              title={`${channel} Twitch stream`}
            />
          )}
        </foreignObject>
      )}

      {/* Stream zone border indicator */}
      <rect
        x={STREAM_ZONE.x}
        y={STREAM_ZONE.y}
        width={STREAM_ZONE.width}
        height={STREAM_ZONE.height}
        fill="none"
        stroke="rgba(59, 130, 246, 0.5)"
        strokeWidth={2}
        strokeDasharray="8 4"
        rx={4}
      />
      <text
        x={STREAM_ZONE.x + 8}
        y={STREAM_ZONE.y - 8}
        fill="rgba(59, 130, 246, 0.8)"
        fontSize={14}
        fontWeight={600}
        fontFamily="sans-serif"
      >
        Stream Zone (1920×1080)
      </text>
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

  // Inject the Twitch embed + stream zone as the canvas Background component
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
