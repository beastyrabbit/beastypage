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
  const streamChipRef = useRef<HTMLButtonElement>(null);
  const streamMenuRef = useRef<HTMLDivElement>(null);
  const [interactMode, setInteractMode] = useState(false);
  const [streamMenu, setStreamMenu] = useState<{ x: number; y: number } | null>(null);

  const closeStreamMenu = useCallback(() => {
    setStreamMenu(null);
  }, []);

  const openStreamMenu = useCallback(
    (x: number, y: number) => {
      if (!channel) return;
      setStreamMenu({ x, y });
    },
    [channel],
  );

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

  useEffect(() => {
    if (!streamMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (streamMenuRef.current?.contains(target) || streamChipRef.current?.contains(target))
      ) {
        return;
      }

      closeStreamMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeStreamMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeStreamMenu, streamMenu]);

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
            ref={streamChipRef}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openStreamMenu(event.clientX, event.clientY);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openStreamMenu(event.clientX, event.clientY);
            }}
            aria-label="Open stream controls"
            style={{
              position: "absolute",
              top: "-26px",
              right: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              padding: "3px 10px",
              borderRadius: "999px",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              background: interactMode
                ? "rgba(59, 130, 246, 0.22)"
                : "rgba(15, 23, 42, 0.72)",
              color: "rgba(255, 255, 255, 0.9)",
              cursor: "context-menu",
              pointerEvents: "auto",
              userSelect: "none",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "999px",
                background: interactMode ? "rgb(34, 197, 94)" : "rgba(255, 255, 255, 0.45)",
                boxShadow: interactMode ? "0 0 8px rgba(34, 197, 94, 0.65)" : "none",
              }}
            />
            Stream
          </button>
        )}
      </div>
      {streamMenu ? (
        <div
          ref={streamMenuRef}
          style={{
            position: "fixed",
            top: streamMenu.y,
            left: streamMenu.x,
            zIndex: 1000,
            minWidth: "200px",
            padding: "6px",
            borderRadius: "10px",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            background: "rgba(15, 23, 42, 0.96)",
            boxShadow: "0 18px 40px rgba(2, 6, 23, 0.45)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            pointerEvents: "auto",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={() => {
              setInteractMode((prev) => !prev);
              closeStreamMenu();
            }}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              color: "rgba(255, 255, 255, 0.92)",
              fontSize: "13px",
              textAlign: "left",
              padding: "9px 10px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            {interactMode ? "Back to drawing" : "Enter interact mode"}
          </button>
        </div>
      ) : null}
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
  const {
    interactiveShapeId,
    setInteractiveShapeId,
    setSettingsShapeId,
  } = useContext(YouTubeInteractionCtx);
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
  const isEditorAudioEnabled = selectedShape.props.editorAudioEnabled ?? false;

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
              setSettingsShapeId(selectedShape.id);
              editor.setCurrentTool("select");
              editor.setEditingShape(null);
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
                  setSettingsShapeId(null);
                  editor.setCurrentTool("select");
                  editor.setEditingShape(null);
                  return;
                }

                setSettingsShapeId(null);
                setInteractiveShapeId(selectedShape.id);
                editor.setCurrentTool("select");
                editor.setEditingShape(null);
              }}
            />
            <TldrawUiMenuItem
              id="media-shape-editor-audio"
              label={`Editor audio: ${isEditorAudioEnabled ? "On" : "Off"}`}
              onSelect={() => {
                if (isYouTubeShape) {
                  editor.updateShape({
                    id: selectedShape.id,
                    type: "youtube-embed",
                    props: {
                      editorAudioEnabled: !isEditorAudioEnabled,
                    },
                  });
                }

                if (isAudioShape) {
                  editor.updateShape({
                    id: selectedShape.id,
                    type: "audio-player",
                    props: {
                      editorAudioEnabled: !isEditorAudioEnabled,
                    },
                  });
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
  const {
    interactiveShapeId,
    settingsShapeId,
    setInteractiveShapeId,
    setSettingsShapeId,
  } = useContext(YouTubeInteractionCtx);
  const selectedShape = useValue(
    "selected youtube shape",
    () => editor.getOnlySelectedShape(),
    [editor],
  );

  useEffect(() => {
    if (!interactiveShapeId && !settingsShapeId) return;

    if (
      !selectedShape ||
      (interactiveShapeId && selectedShape.id !== interactiveShapeId) ||
      (settingsShapeId && selectedShape.id !== settingsShapeId) ||
      (selectedShape.type !== "youtube-embed" && selectedShape.type !== "audio-player")
    ) {
      setInteractiveShapeId(null);
      setSettingsShapeId(null);
      editor.setCurrentTool("select");
      editor.setEditingShape(null);
    }
  }, [
    editor,
    interactiveShapeId,
    selectedShape,
    setInteractiveShapeId,
    setSettingsShapeId,
    settingsShapeId,
  ]);

  useEffect(() => {
    if (!interactiveShapeId && !settingsShapeId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setInteractiveShapeId(null);
      setSettingsShapeId(null);
      editor.setCurrentTool("select");
      editor.setEditingShape(null);
      editor.getContainer().focus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    editor,
    interactiveShapeId,
    setInteractiveShapeId,
    setSettingsShapeId,
    settingsShapeId,
  ]);

  return null;
}

export function CanvasEditor({ roomId, twitchChannel }: CanvasEditorProps) {
  const { getToken } = useAuth();
  const [interactiveShapeId, setInteractiveShapeId] = useState<string | null>(null);
  const [settingsShapeId, setSettingsShapeId] = useState<string | null>(null);

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
    () => ({
      interactiveShapeId,
      settingsShapeId,
      setInteractiveShapeId,
      setSettingsShapeId,
    }),
    [interactiveShapeId, settingsShapeId],
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
