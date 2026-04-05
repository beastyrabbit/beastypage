"use client";

import { useAuth } from "@clerk/nextjs";
import { useSync } from "@tldraw/sync";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type TLAssetStore, Tldraw, useEditor } from "tldraw";
import "tldraw/tldraw.css";
import { buildEditorWsUrl, uploadFile } from "@/lib/stream-canvas/api";
import { STREAM_ZONE } from "@/lib/stream-canvas/stream-zone";

interface CanvasEditorProps {
  roomId: string;
  twitchChannel?: string | null;
}

/**
 * Keep a DOM element positioned over the stream zone as the tldraw camera moves.
 * Returns a ref to attach to the element.
 */
function useStreamZoneOverlay() {
  const editor = useEditor();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      if (!ref.current) return;
      const { x, y, z } = editor.getCamera();
      // camera.x/y are already in screen-space — do NOT multiply by z
      const screenX = STREAM_ZONE.x * z + x;
      const screenY = STREAM_ZONE.y * z + y;
      const screenW = STREAM_ZONE.width * z;
      const screenH = STREAM_ZONE.height * z;
      ref.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
      ref.current.style.width = `${screenW}px`;
      ref.current.style.height = `${screenH}px`;
    }

    const dispose = editor.store.listen(update, {
      source: "all",
      scope: "session",
    });
    update();
    return dispose;
  }, [editor]);

  return ref;
}

/**
 * Pure CSS overlay showing the 1920x1080 stream zone.
 * This is NOT a tldraw shape — it's a DOM overlay that moves with the camera.
 * It won't appear on the OBS mirror since it doesn't exist in the tldraw store.
 */
function StreamZoneIndicator() {
  const editor = useEditor();
  const ref = useStreamZoneOverlay();

  // Clean up any leftover stream zone frame shapes from the old implementation
  useEffect(() => {
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.meta?.isStreamZone) {
        editor.deleteShape(shape.id);
      }
    }
  }, [editor]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        border: "2px dashed rgba(59, 130, 246, 0.5)",
        borderRadius: "4px",
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
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
    </div>
  );
}

/**
 * Twitch player embed that follows the camera position.
 * Rendered as a DOM overlay — not a tldraw shape, so it won't appear on OBS.
 */
function TwitchEmbed({ channel }: { channel: string }) {
  const ref = useStreamZoneOverlay();

  // Twitch requires the parent domain in the embed URL.
  // .localhost domains are rejected — use the base hostname for production,
  // and show a placeholder locally.
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = hostname.endsWith(".localhost") || hostname === "localhost";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 1,
        overflow: "hidden",
        borderRadius: "4px",
      }}
    >
      {isLocal ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            fontFamily: "sans-serif",
          }}
        >
          Twitch embed disabled on localhost — works in production
          <br />
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
            pointerEvents: "auto",
          }}
          allowFullScreen
          title={`${channel} Twitch stream`}
        />
      )}
    </div>
  );
}

export function CanvasEditor({ roomId, twitchChannel }: CanvasEditorProps) {
  const { getToken } = useAuth();

  // Provide a fresh URI on each (re)connection so Clerk tokens are always current
  const getUri = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    return buildEditorWsUrl(roomId, token);
  }, [roomId, getToken]);

  // Asset store: upload files to the canvas backend, resolve by returning src as-is
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
      <Tldraw store={storeWithStatus.store}>
        <StreamZoneIndicator />
        {twitchChannel && <TwitchEmbed channel={twitchChannel} />}
      </Tldraw>
    </div>
  );
}
