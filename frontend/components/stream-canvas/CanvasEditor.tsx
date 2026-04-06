"use client";

import { useAuth } from "@clerk/nextjs";
import { useSync } from "@tldraw/sync";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  DefaultToolbar,
  DefaultToolbarContent,
  type TLAssetStore,
  type TLComponents,
  type TLUiContextMenuProps,
  type TLUiOverrides,
  TldrawUiMenuActionItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  Tldraw,
  ToolbarItem,
  useEditor,
  useValue,
} from "tldraw";
import "tldraw/tldraw.css";
import { buildEditorWsUrl, CANVAS_API, uploadFile } from "@/lib/stream-canvas/api";
import {
  STREAM_ZONE,
  getStreamZoneViewportPlacement,
} from "@/lib/stream-canvas/stream-zone";
import { customShapeUtils, customTools, syncShapeUtils } from "./shapes/shared";
import {
  AudioUploadCtx,
  getAudioSyncedPlaybackPosition,
} from "./shapes/audio/AudioPlayerShape";
import {
  getSyncedPlaybackPosition,
  YouTubeInteractionCtx,
} from "./shapes/youtube/YouTubeEmbedShape";

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
      const camera = editor.getCamera();
      const { transform } = getStreamZoneViewportPlacement(
        (point) => editor.pageToViewport(point),
        camera,
      );
      containerRef.current.style.transform = transform;
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
            onClick={() => setInteractMode((prev) => !prev)}
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

// ---------------------------------------------------------------------------
// Toolbar overrides — add YouTube and Audio tool buttons
// ---------------------------------------------------------------------------

const editorOverrides: TLUiOverrides = {
  tools(editor, tools) {
    tools["youtube-embed"] = {
      id: "youtube-embed",
      icon: "tool-media",
      label: "YouTube",
      onSelect: () => {
        editor.setCurrentTool("youtube-embed");
      },
    };
    tools["audio-player"] = {
      id: "audio-player",
      icon: "tool-media",
      label: "Audio",
      onSelect: () => {
        editor.setCurrentTool("audio-player");
      },
    };
    return tools;
  },
};

function CanvasToolbar() {
  return (
    <DefaultToolbar>
      <DefaultToolbarContent />
      <ToolbarItem tool="youtube-embed" />
      <ToolbarItem tool="audio-player" />
    </DefaultToolbar>
  );
}

function isMediaShape(shape: ReturnType<typeof useEditor>["getOnlySelectedShape"] extends (...args: never[]) => infer T ? T : never) {
  return shape?.type === "youtube-embed" || shape?.type === "audio-player";
}

function MediaShapeContextMenuContent() {
  const editor = useEditor();
  const { interactiveShapeId, setInteractiveShapeId } = useContext(YouTubeInteractionCtx);
  const selectedShape = useValue(
    "selected media shape",
    () => editor.getOnlySelectedShape(),
    [editor],
  );

  if (!selectedShape || !isMediaShape(selectedShape)) {
    return null;
  }

  const hasUrl = Boolean(selectedShape.props.url);
  const isYouTubeShape = selectedShape.type === "youtube-embed";
  const isAudioShape = selectedShape.type === "audio-player";
  const canInteract = (isYouTubeShape || isAudioShape) && hasUrl;
  const isInteractive = interactiveShapeId === selectedShape.id;

  const enterEditingShape = () => {
    queueMicrotask(() => {
      if (!editor.getShape(selectedShape.id)) return;
      editor.setCurrentTool("select");
      editor.setEditingShape(selectedShape.id);
    });
  };

  return (
    <>
      <TldrawUiMenuGroup id="media-shape-actions">
        {isYouTubeShape ? (
          <TldrawUiMenuItem
            id="media-shape-settings"
            icon="edit"
            label="Open settings"
            onSelect={() => {
              if (canInteract) {
                const playbackPosition = getSyncedPlaybackPosition(selectedShape.props);
                editor.updateShape({
                  id: selectedShape.id,
                  type: "youtube-embed",
                  props: {
                    playbackPosition,
                    playbackUpdatedAt: Date.now(),
                  },
                });
              }

              setInteractiveShapeId(null);
              enterEditingShape();
            }}
          />
        ) : null}
        {canInteract ? (
          <>
            <TldrawUiMenuItem
              id="media-shape-interact"
              icon="external-link"
              label={isInteractive ? "Exit interact mode" : "Enter interact mode"}
              onSelect={() => {
                if (isInteractive) {
                  setInteractiveShapeId(null);
                  editor.setCurrentTool("select");
                  editor.setEditingShape(null);
                  return;
                }

                setInteractiveShapeId(selectedShape.id);
                editor.setCurrentTool("select");
                if (isAudioShape) {
                  editor.setEditingShape(null);
                } else {
                  enterEditingShape();
                }
              }}
            />
            <TldrawUiMenuItem
              id="media-shape-resync"
              label="Resync player"
              onSelect={() => {
                if (isYouTubeShape) {
                  const playbackPosition = getSyncedPlaybackPosition(selectedShape.props);
                  editor.updateShape({
                    id: selectedShape.id,
                    type: "youtube-embed",
                    props: {
                      playbackPosition,
                      playbackUpdatedAt: Date.now(),
                    },
                  });
                }

                if (isAudioShape) {
                  const playbackPosition = getAudioSyncedPlaybackPosition(selectedShape.props);
                  editor.updateShape({
                    id: selectedShape.id,
                    type: "audio-player",
                    props: {
                      playbackPosition,
                      playbackUpdatedAt: Date.now(),
                    },
                  });
                }
              }}
            />
          </>
        ) : null}
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="media-shape-edit-actions">
        <TldrawUiMenuActionItem actionId="duplicate" />
        <TldrawUiMenuActionItem actionId="delete" />
      </TldrawUiMenuGroup>
    </>
  );
}

function CanvasContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor();
  const selectedShape = useValue(
    "selected context menu shape",
    () => editor.getOnlySelectedShape(),
    [editor],
  );
  const showMediaMenu = Boolean(selectedShape && isMediaShape(selectedShape));

  return (
    <DefaultContextMenu {...props}>
      {showMediaMenu ? <MediaShapeContextMenuContent /> : <DefaultContextMenuContent />}
    </DefaultContextMenu>
  );
}

function YouTubeInteractionController() {
  const editor = useEditor();
  const { interactiveShapeId, setInteractiveShapeId } = useContext(YouTubeInteractionCtx);
  const selectedShape = useValue(
    "selected youtube shape",
    () => editor.getOnlySelectedShape(),
    [editor],
  );
  const editingShapeId = useValue(
    "editing shape id",
    () => editor.getEditingShapeId(),
    [editor],
  );

  useEffect(() => {
    if (!interactiveShapeId) return;

    if (
      !selectedShape ||
      selectedShape.id !== interactiveShapeId ||
      (selectedShape.type !== "youtube-embed" && selectedShape.type !== "audio-player")
    ) {
      setInteractiveShapeId(null);
      editor.setCurrentTool("select");
      editor.setEditingShape(null);
    }
  }, [editor, interactiveShapeId, selectedShape, setInteractiveShapeId]);

  useEffect(() => {
    if (!interactiveShapeId) return;

    if (editingShapeId === interactiveShapeId || editingShapeId === null) {
      return;
    }

    setInteractiveShapeId(null);
    editor.setCurrentTool("select");
    editor.setEditingShape(null);
  }, [editor, editingShapeId, interactiveShapeId, setInteractiveShapeId]);

  useEffect(() => {
    if (!interactiveShapeId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setInteractiveShapeId(null);
      editor.setCurrentTool("select");
      editor.setEditingShape(null);
      editor.getContainer().focus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editor, interactiveShapeId, setInteractiveShapeId]);

  return null;
}

export function CanvasEditor({ roomId, twitchChannel }: CanvasEditorProps) {
  const { getToken } = useAuth();
  const [interactiveShapeId, setInteractiveShapeId] = useState<string | null>(null);

  const getUri = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    return buildEditorWsUrl(roomId, token);
  }, [roomId, getToken]);

  const assets = useMemo<TLAssetStore>(
    () => ({
      async upload(_asset, file) {
        const result = await uploadFile(roomId, file, getToken);
        return { src: `${CANVAS_API}${result.url}` };
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
      ContextMenu: CanvasContextMenu,
      Toolbar: CanvasToolbar,
    }),
    [twitchChannel],
  );

  const audioUploadCtx = useMemo(
    () => ({ roomId, getToken }),
    [roomId, getToken],
  );
  const youtubeInteractionCtx = useMemo(
    () => ({ interactiveShapeId, setInteractiveShapeId }),
    [interactiveShapeId],
  );

  const storeWithStatus = useSync({
    uri: getUri,
    assets,
    shapeUtils: syncShapeUtils,
  });

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
      <AudioUploadCtx.Provider value={audioUploadCtx}>
        <YouTubeInteractionCtx.Provider value={youtubeInteractionCtx}>
          <Tldraw
            store={storeWithStatus.store}
            shapeUtils={customShapeUtils}
            tools={customTools}
            overrides={editorOverrides}
            components={components}
          >
            <LegacyCleanup />
            <YouTubeInteractionController />
          </Tldraw>
        </YouTubeInteractionCtx.Provider>
      </AudioUploadCtx.Provider>
    </div>
  );
}
