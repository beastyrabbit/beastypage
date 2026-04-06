import {
  BaseBoxShapeUtil,
  type Editor,
  HTMLContainer,
  Rectangle2d,
  type RecordProps,
  type TLBaseShape,
  type TLResizeInfo,
  T,
  resizeBox,
  useValue,
} from "tldraw";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_MEDIA_VOLUME,
  getEffectiveMediaVolume,
} from "@/lib/stream-canvas/media-volume";
import { rectIntersectsStreamZone } from "@/lib/stream-canvas/stream-zone";

// ---------------------------------------------------------------------------
// Shape type
// ---------------------------------------------------------------------------

type YouTubeEmbedShapeProps = {
  w: number;
  h: number;
  url: string;
  volume?: number;
  isPlaying?: boolean;
  playbackPosition?: number;
  playbackUpdatedAt?: number;
};

type YouTubeEmbedShape = TLBaseShape<"youtube-embed", YouTubeEmbedShapeProps>;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "youtube-embed": YouTubeEmbedShapeProps;
  }
}

// ---------------------------------------------------------------------------
// Props validator
// ---------------------------------------------------------------------------

export const youtubeEmbedShapeProps: RecordProps<YouTubeEmbedShape> = {
  w: T.number,
  h: T.number,
  url: T.string,
  volume: T.optional(T.number),
  isPlaying: T.optional(T.boolean),
  playbackPosition: T.optional(T.number),
  playbackUpdatedAt: T.optional(T.number),
};

export interface YouTubeInteractionContextValue {
  interactiveShapeId: string | null;
  setInteractiveShapeId: (shapeId: string | null) => void;
}

export const YouTubeInteractionCtx =
  createContext<YouTubeInteractionContextValue>({
    interactiveShapeId: null,
    setInteractiveShapeId: () => {},
  });

type EventWithStopPropagation = {
  stopPropagation(): void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a YouTube video ID from various URL formats:
 *  - youtube.com/watch?v=ID
 *  - youtu.be/ID
 *  - youtube.com/embed/ID
 *  - youtube.com/shorts/ID
 *  - youtube.com/live/ID
 */
export function extractYouTubeId(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // youtu.be short link
  const shortMatch = trimmed.match(
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  );
  if (shortMatch) return shortMatch[1];

  // youtube.com variants
  const longMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/,
  );
  if (longMatch) return longMatch[1];

  return null;
}

function stopPropagation(event: EventWithStopPropagation) {
  event.stopPropagation();
}

const YOUTUBE_SYNC_THRESHOLD_PLAYING = 1.5;
const YOUTUBE_SYNC_THRESHOLD_PAUSED = 0.75;
const YOUTUBE_COMMAND_HOLD_MS = 900;

type YouTubePlayer = {
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getIframe?: () => HTMLIFrameElement;
  getPlayerState: () => number;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume?: (volume: number) => void;
  unMute?: () => void;
};

type YouTubePlayerReadyEvent = {
  target: YouTubePlayer;
};

type YouTubePlayerStateChangeEvent = {
  data: number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: YouTubePlayerReadyEvent) => void;
        onStateChange?: (event: YouTubePlayerStateChangeEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: (() => void) | undefined;
  }
}

let youtubeIframeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube iframe API requires a browser"));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const scriptId = "youtube-iframe-api";
    const existingScript = document.getElementById(
      scriptId,
    ) as HTMLScriptElement | null;
    const previousReady = window.onYouTubeIframeAPIReady;

    const finish = () => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }

      youtubeIframeApiPromise = null;
      reject(new Error("YouTube iframe API failed to initialize"));
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };

    if (existingScript) {
      window.setTimeout(() => {
        if (window.YT?.Player) {
          finish();
        }
      }, 0);
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeIframeApiPromise = null;
      reject(new Error("Failed to load YouTube iframe API"));
    };
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

export function getSyncedPlaybackPosition(
  props: Pick<
    YouTubeEmbedShapeProps,
    "isPlaying" | "playbackPosition" | "playbackUpdatedAt"
  >,
) {
  const playbackPosition = props.playbackPosition ?? 0;

  if (!props.isPlaying) {
    return playbackPosition;
  }

  return (
    playbackPosition +
    Math.max(0, Date.now() - (props.playbackUpdatedAt ?? 0)) / 1000
  );
}

function YouTubeEmbedPlayer({
  editor,
  shape,
  isReadonly,
  onUpdateProps,
  isAudibleInReadonly,
}: {
  editor: Editor;
  shape: YouTubeEmbedShape;
  isReadonly: boolean;
  onUpdateProps: (props: Partial<YouTubeEmbedShape["props"]>) => void;
  isAudibleInReadonly: boolean;
}) {
  const { interactiveShapeId, setInteractiveShapeId } = useContext(
    YouTubeInteractionCtx,
  );
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const commandHoldUntilRef = useRef(0);
  const interactiveRef = useRef(false);
  const readonlyRef = useRef(isReadonly);
  const syncedVolume = shape.props.volume ?? DEFAULT_MEDIA_VOLUME;
  const audibleInReadonlyRef = useRef(isAudibleInReadonly);
  const syncedVolumeRef = useRef(syncedVolume);
  const updatePropsRef = useRef(onUpdateProps);
  const syncedStateRef = useRef({
    isPlaying: shape.props.isPlaying ?? false,
    playbackPosition: shape.props.playbackPosition ?? 0,
    playbackUpdatedAt: shape.props.playbackUpdatedAt ?? 0,
  });
  const isInteractive = isReadonly || interactiveShapeId === shape.id;
  const videoId = extractYouTubeId(shape.props.url);
  const syncedIsPlaying = shape.props.isPlaying ?? false;
  const syncedPlaybackPosition = shape.props.playbackPosition ?? 0;
  const syncedPlaybackUpdatedAt = shape.props.playbackUpdatedAt ?? 0;

  const syncLocalAudioState = useEffectEvent((player: YouTubePlayer) => {
    const effectiveVolume = getEffectiveMediaVolume(syncedVolumeRef.current);
    const isVolumeMuted = effectiveVolume <= 0.001;

    player.setVolume?.(Math.round(effectiveVolume * 100));

    if (readonlyRef.current) {
      if (audibleInReadonlyRef.current && !isVolumeMuted) {
        player.unMute?.();
      } else {
        player.mute();
      }
      return;
    }

    if (!interactiveRef.current || isVolumeMuted) {
      player.mute();
      return;
    }

    player.unMute?.();
  });

  const applySyncedStateToPlayer = useEffectEvent(() => {
    const player = playerRef.current;
    if (!player || !playerReadyRef.current) {
      return;
    }

    const desiredPlaybackPosition = getSyncedPlaybackPosition(
      syncedStateRef.current,
    );
    const currentPlaybackPosition = player.getCurrentTime?.() ?? 0;
    const playerState = player.getPlayerState?.();
    const isPlayerPlaying =
      playerState === window.YT?.PlayerState.PLAYING ||
      playerState === window.YT?.PlayerState.BUFFERING;

    syncLocalAudioState(player);

    if (
      Math.abs(currentPlaybackPosition - desiredPlaybackPosition) >
      YOUTUBE_SYNC_THRESHOLD_PLAYING
    ) {
      commandHoldUntilRef.current = Date.now() + YOUTUBE_COMMAND_HOLD_MS;
      player.seekTo(desiredPlaybackPosition, true);
    }

    if (syncedStateRef.current.isPlaying) {
      if (!isPlayerPlaying) {
        commandHoldUntilRef.current = Date.now() + YOUTUBE_COMMAND_HOLD_MS;
        syncLocalAudioState(player);
        player.playVideo();
      }
      return;
    }

    if (isPlayerPlaying) {
      commandHoldUntilRef.current = Date.now() + YOUTUBE_COMMAND_HOLD_MS;
      player.pauseVideo();
    }
  });

  useEffect(() => {
    interactiveRef.current = isInteractive;
    readonlyRef.current = isReadonly;
    audibleInReadonlyRef.current = isAudibleInReadonly;
    syncedVolumeRef.current = syncedVolume;
    updatePropsRef.current = onUpdateProps;
    syncedStateRef.current = {
      isPlaying: syncedIsPlaying,
      playbackPosition: syncedPlaybackPosition,
      playbackUpdatedAt: syncedPlaybackUpdatedAt,
    };

    const iframe = playerRef.current?.getIframe?.();
    if (iframe) {
      iframe.style.pointerEvents = isInteractive ? "all" : "none";
      iframe.style.zIndex = isInteractive ? "" : "-1";
      iframe.tabIndex = isInteractive ? 0 : -1;
    }

    const player = playerRef.current;
    if (player) {
      syncLocalAudioState(player);
    }

    applySyncedStateToPlayer();

    const timeoutId = window.setTimeout(() => {
      applySyncedStateToPlayer();
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAudibleInReadonly,
    isInteractive,
    isReadonly,
    onUpdateProps,
    syncedIsPlaying,
    syncedPlaybackPosition,
    syncedPlaybackUpdatedAt,
    syncedVolume,
  ]);

  useEffect(() => {
    const host = playerHostRef.current;
    if (!host || !videoId) {
      return;
    }

    let cancelled = false;
    playerReadyRef.current = false;
    host.innerHTML = "";

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !playerHostRef.current) {
          return;
        }

        playerRef.current?.destroy();
        playerRef.current = new YT.Player(playerHostRef.current, {
          videoId,
          playerVars: {
            controls: isReadonly ? 0 : 1,
            playsinline: 1,
            rel: 0,
            autoplay: 0,
            fs: 1,
            modestbranding: 1,
          },
          events: {
            onReady: (event) => {
              if (cancelled) {
                return;
              }

              playerReadyRef.current = true;
              event.target.cueVideoById(
                videoId,
                syncedStateRef.current.playbackPosition,
              );

              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.style.border = "none";
                const iframeIsInteractive = interactiveRef.current;
                iframe.style.pointerEvents = iframeIsInteractive
                  ? "all"
                  : "none";
                iframe.style.zIndex = iframeIsInteractive ? "" : "-1";
                iframe.tabIndex = iframeIsInteractive ? 0 : -1;
                iframe.allow =
                  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
              }

              syncLocalAudioState(event.target);

              window.setTimeout(() => {
                applySyncedStateToPlayer();
              }, 100);
            },
            onStateChange: (event) => {
              if (readonlyRef.current || !interactiveRef.current) {
                return;
              }

              if (Date.now() < commandHoldUntilRef.current) {
                return;
              }

              const player = playerRef.current;
              if (!player) {
                return;
              }

              const currentPlaybackPosition = player.getCurrentTime?.() ?? 0;

              if (event.data === YT.PlayerState.PLAYING) {
                updatePropsRef.current({
                  isPlaying: true,
                  playbackPosition: currentPlaybackPosition,
                  playbackUpdatedAt: Date.now(),
                });
              }

              if (
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.ENDED
              ) {
                updatePropsRef.current({
                  isPlaying: false,
                  playbackPosition: currentPlaybackPosition,
                  playbackUpdatedAt: Date.now(),
                });
              }
            },
          },
        });
      })
      .catch((error) => {
        console.error("[youtube-embed] Failed to initialize player", error);
      });

    return () => {
      cancelled = true;
      playerReadyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.innerHTML = "";
    };
  }, [videoId, isReadonly]);

  useEffect(() => {
    if (isReadonly || !isInteractive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (Date.now() < commandHoldUntilRef.current) {
        return;
      }

      const player = playerRef.current;
      if (!player || !playerReadyRef.current) {
        return;
      }

      const currentPlaybackPosition = player.getCurrentTime?.() ?? 0;
      const playerState = player.getPlayerState?.();
      const localIsPlaying =
        playerState === window.YT?.PlayerState.PLAYING ||
        playerState === window.YT?.PlayerState.BUFFERING;
      const desiredPlaybackPosition = getSyncedPlaybackPosition(
        syncedStateRef.current,
      );
      const syncThreshold = localIsPlaying
        ? YOUTUBE_SYNC_THRESHOLD_PLAYING
        : YOUTUBE_SYNC_THRESHOLD_PAUSED;

      if (
        Math.abs(currentPlaybackPosition - desiredPlaybackPosition) <=
        syncThreshold
      ) {
        return;
      }

      updatePropsRef.current({
        isPlaying: localIsPlaying,
        playbackPosition: currentPlaybackPosition,
        playbackUpdatedAt: Date.now(),
      });
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isReadonly, isInteractive]);

  if (!videoId) {
    return null;
  }

  const playerContent = (
    <>
      <div
        ref={playerHostRef}
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: isInteractive ? "all" : "none",
        }}
      />
      {!isReadonly && isInteractive ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setInteractiveShapeId(null);
            editor.setCurrentTool("select");
            editor.setEditingShape(null);
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.78)",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.1,
            cursor: "pointer",
          }}
        >
          Back to drawing
        </button>
      ) : null}
    </>
  );

  if (!isReadonly && !isInteractive) {
    return (
      <button
        type="button"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          border: "none",
          padding: 0,
          background: "transparent",
          cursor: "pointer",
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setInteractiveShapeId(shape.id);
          editor.setCurrentTool("select");
          editor.setEditingShape(shape.id);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") {
            return;
          }

          e.preventDefault();
          e.stopPropagation();
          setInteractiveShapeId(shape.id);
          editor.setCurrentTool("select");
          editor.setEditingShape(shape.id);
        }}
      >
        {playerContent}
      </button>
    );
  }

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onPointerDownCapture={(e) => {
        if (isInteractive) {
          e.stopPropagation();
        }
      }}
      onPointerUpCapture={(e) => {
        if (isInteractive) {
          e.stopPropagation();
        }
      }}
    >
      {playerContent}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShapeUtil
// ---------------------------------------------------------------------------

function YouTubeEmbedShapeComponent({
  editor,
  shape,
}: {
  editor: Editor;
  shape: YouTubeEmbedShape;
}) {
  const { interactiveShapeId } = useContext(YouTubeInteractionCtx);
  const videoId = extractYouTubeId(shape.props.url);
  const editingShapeId = useValue(
    "editing youtube shape",
    () => editor.getEditingShapeId(),
    [editor],
  );
  const isReadonly = useValue(
    "youtube readonly state",
    () => editor.getInstanceState().isReadonly,
    [editor],
  );
  const isSettingsOpen =
    editingShapeId === shape.id && interactiveShapeId !== shape.id;
  const pageBounds = useValue(
    "youtube page bounds",
    () => editor.getShapePageBounds(shape),
    [editor, shape],
  );
  const isAudibleInReadonly = Boolean(
    pageBounds && rectIntersectsStreamZone(pageBounds),
  );
  const [draftUrl, setDraftUrl] = useState(shape.props.url);

  useEffect(() => {
    setDraftUrl(shape.props.url);
  }, [shape.props.url]);

  const commitDraftUrl = () => {
    const value = draftUrl.trim();
    if (value === shape.props.url) {
      return false;
    }

    editor.updateShape<YouTubeEmbedShape>({
      id: shape.id,
      type: "youtube-embed",
      props: {
        url: value,
        isPlaying: false,
        playbackPosition: 0,
        playbackUpdatedAt: Date.now(),
      },
    });

    return true;
  };

  const closeSettings = () => {
    const didChangeUrl = commitDraftUrl();

    if (!didChangeUrl && shape.props.url.trim()) {
      editor.updateShape<YouTubeEmbedShape>({
        id: shape.id,
        type: "youtube-embed",
        props: {
          playbackPosition: getSyncedPlaybackPosition(shape.props),
          playbackUpdatedAt: Date.now(),
        },
      });
    }

    editor.setCurrentTool("select");
    editor.setEditingShape(null);
  };

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        overflow: "hidden",
        borderRadius: 8,
        background: "#000",
      }}
    >
      {videoId && !isSettingsOpen ? (
        <YouTubeEmbedPlayer
          editor={editor}
          shape={shape}
          isReadonly={isReadonly}
          isAudibleInReadonly={isAudibleInReadonly}
          onUpdateProps={(props) => {
            editor.updateShape<YouTubeEmbedShape>({
              id: shape.id,
              type: "youtube-embed",
              props,
            });
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "rgba(0,0,0,0.9)",
            color: "#fff",
            fontFamily: "sans-serif",
            padding: 16,
            position: "relative",
            pointerEvents: "all",
            zIndex: 1,
            userSelect: "text",
          }}
          onPointerDownCapture={stopPropagation}
          onPointerUpCapture={stopPropagation}
          onPointerMoveCapture={stopPropagation}
          onMouseDownCapture={stopPropagation}
          onMouseUpCapture={stopPropagation}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          >
            <title>YouTube video placeholder</title>
            <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
            <path d="m10 15 5-3-5-3z" />
          </svg>
          {!isReadonly && (
            <>
              <span style={{ fontSize: 13, opacity: 0.7 }}>
                Paste a YouTube URL
              </span>
              <input
                type="text"
                ref={(element) => {
                  if (
                    element &&
                    isSettingsOpen &&
                    document.activeElement !== element
                  ) {
                    element.focus();
                  }
                }}
                placeholder="https://youtube.com/watch?v=..."
                value={draftUrl}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    closeSettings();
                  }
                  e.stopPropagation();
                }}
                onBlur={() => {
                  commitDraftUrl();
                }}
                onContextMenu={(e) => e.stopPropagation()}
                style={{
                  width: "80%",
                  maxWidth: 320,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  pointerEvents: "all",
                }}
              />
              <div
                style={{
                  width: "80%",
                  maxWidth: 320,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
                onPointerDownCapture={stopPropagation}
                onPointerUpCapture={stopPropagation}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    opacity: 0.78,
                  }}
                >
                  <span>OBS volume</span>
                  <span>
                    {Math.round(
                      (shape.props.volume ?? DEFAULT_MEDIA_VOLUME) * 100,
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={shape.props.volume ?? DEFAULT_MEDIA_VOLUME}
                  onChange={(e) => {
                    const volume = Number.parseFloat(e.target.value);
                    editor.updateShape<YouTubeEmbedShape>({
                      id: shape.id,
                      type: "youtube-embed",
                      props: { volume },
                    });
                  }}
                  onInput={(e) => {
                    const volume = Number.parseFloat(
                      (e.target as HTMLInputElement).value,
                    );
                    editor.updateShape<YouTubeEmbedShape>({
                      id: shape.id,
                      type: "youtube-embed",
                      props: { volume },
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    accentColor: "#60a5fa",
                    height: 4,
                    pointerEvents: "all",
                    cursor: "pointer",
                  }}
                />
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeSettings();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      )}
    </HTMLContainer>
  );
}

export class YouTubeEmbedShapeUtil extends BaseBoxShapeUtil<YouTubeEmbedShape> {
  static override type = "youtube-embed" as const;
  static override props = youtubeEmbedShapeProps;

  override getDefaultProps(): YouTubeEmbedShape["props"] {
    return {
      w: 480,
      h: 270,
      url: "",
      volume: DEFAULT_MEDIA_VOLUME,
      isPlaying: false,
      playbackPosition: 0,
      playbackUpdatedAt: 0,
    };
  }

  getGeometry(shape: YouTubeEmbedShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: YouTubeEmbedShape) {
    return <YouTubeEmbedShapeComponent editor={this.editor} shape={shape} />;
  }

  indicator(shape: YouTubeEmbedShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }

  override canResize() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override canEdit() {
    return false;
  }

  override onResize(
    shape: YouTubeEmbedShape,
    info: TLResizeInfo<YouTubeEmbedShape>,
  ) {
    return resizeBox(shape, info);
  }
}
