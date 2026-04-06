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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CANVAS_API, uploadFile } from "@/lib/stream-canvas/api";
import {
  DEFAULT_MEDIA_VOLUME,
  getEffectiveMediaVolume,
} from "@/lib/stream-canvas/media-volume";
import { rectIntersectsStreamZone } from "@/lib/stream-canvas/stream-zone";
import { YouTubeInteractionCtx } from "../youtube/YouTubeEmbedShape";

// ---------------------------------------------------------------------------
// Shape type
// ---------------------------------------------------------------------------

type AudioPlayerShapeProps = {
  w: number;
  h: number;
  url: string;
  volume: number;
  loop: boolean;
  editorAudioEnabled?: boolean;
  isPlaying?: boolean;
  playbackPosition?: number;
  playbackUpdatedAt?: number;
};

type AudioPlayerShape = TLBaseShape<"audio-player", AudioPlayerShapeProps>;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "audio-player": AudioPlayerShapeProps;
  }
}

// ---------------------------------------------------------------------------
// Props validator
// ---------------------------------------------------------------------------

export const audioPlayerShapeProps: RecordProps<AudioPlayerShape> = {
  w: T.number,
  h: T.number,
  url: T.string,
  volume: T.number,
  loop: T.boolean,
  editorAudioEnabled: T.optional(T.boolean),
  isPlaying: T.optional(T.boolean),
  playbackPosition: T.optional(T.number),
  playbackUpdatedAt: T.optional(T.number),
};

// ---------------------------------------------------------------------------
// Context for file upload (provided by CanvasEditor)
// ---------------------------------------------------------------------------

export interface AudioUploadContext {
  roomId: string;
  getToken: () => Promise<string | null>;
}

export const AudioUploadCtx = createContext<AudioUploadContext | null>(null);

type EventWithStopPropagation = {
  stopPropagation(): void;
};

function clampPlaybackPosition(value: number, max: number | null): number {
  const minClamped = Math.max(0, value);

  if (max == null || !Number.isFinite(max) || max <= 0) {
    return minClamped;
  }

  return Math.min(minClamped, max);
}

function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Audio player component (used inside the shape)
// ---------------------------------------------------------------------------

export function getAudioSyncedPlaybackPosition(
  props: Pick<
    AudioPlayerShapeProps,
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

function stopPropagation(event: EventWithStopPropagation) {
  event.stopPropagation();
}

function AudioPlayerComponent({
  editor,
  shape,
  isReadonly,
  onUpdateProps,
}: {
  editor: Editor;
  shape: AudioPlayerShape;
  isReadonly: boolean;
  onUpdateProps: (props: Partial<AudioPlayerShape["props"]>) => void;
}) {
  const { interactiveShapeId, setInteractiveShapeId } = useContext(
    YouTubeInteractionCtx,
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSharedPlaybackRef = useRef(0);
  const lastObservedPlaybackRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFilename, setUploadingFilename] = useState<string | null>(
    null,
  );
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState(shape.props.url);
  const [displayTime, setDisplayTime] = useState(
    shape.props.playbackPosition ?? 0,
  );
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const uploadCtx = useContext(AudioUploadCtx);
  const syncedIsPlaying = shape.props.isPlaying ?? false;
  const syncedPlaybackPosition = shape.props.playbackPosition ?? 0;
  const syncedPlaybackUpdatedAt = shape.props.playbackUpdatedAt ?? 0;
  const pageBounds = useValue(
    "audio page bounds",
    () => editor.getShapePageBounds(shape),
    [editor, shape],
  );
  const isAudibleInReadonly = Boolean(
    pageBounds && rectIntersectsStreamZone(pageBounds),
  );
  const isInteractive = isReadonly || interactiveShapeId === shape.id;
  const showControls = !shape.props.url || isInteractive;
  const editorAudioEnabled = shape.props.editorAudioEnabled ?? false;
  const effectiveVolume = getEffectiveMediaVolume(shape.props.volume);
  const isVolumeMuted = effectiveVolume <= 0.001;
  const shouldOutputAudio = isReadonly
    ? isAudibleInReadonly
    : isInteractive && editorAudioEnabled;
  const currentSyncedTime = getAudioSyncedPlaybackPosition(shape.props);
  const seekPreviewTime = scrubTime ?? displayTime;
  const maxTimelineTime = Math.max(duration, displayTime, currentSyncedTime, 0);
  const passiveProgressRatio =
    maxTimelineTime > 0 ? Math.min(displayTime / maxTimelineTime, 1) : 0;

  useEffect(() => {
    setDraftUrl(shape.props.url);
    setScrubTime(null);
  }, [shape.props.url]);

  useEffect(() => {
    if (!shape.props.url) {
      setDisplayTime(0);
      setDuration(0);
      return;
    }

    if (scrubTime !== null) {
      return;
    }

    const nextDisplayTime = getAudioSyncedPlaybackPosition({
      isPlaying: syncedIsPlaying,
      playbackPosition: syncedPlaybackPosition,
      playbackUpdatedAt: syncedPlaybackUpdatedAt,
    });

    setDisplayTime((previousTime) =>
      Math.abs(previousTime - nextDisplayTime) < 0.01
        ? previousTime
        : nextDisplayTime,
    );
  }, [
    scrubTime,
    shape.props.url,
    syncedIsPlaying,
    syncedPlaybackPosition,
    syncedPlaybackUpdatedAt,
  ]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = effectiveVolume;
    audioRef.current.loop = shape.props.loop;
    audioRef.current.muted = !shouldOutputAudio || isVolumeMuted;
  }, [effectiveVolume, isVolumeMuted, shape.props.loop, shouldOutputAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !shape.props.url) return;

    const desiredTime = clampPlaybackPosition(
      syncedPlaybackPosition +
        (syncedIsPlaying
          ? Math.max(0, Date.now() - syncedPlaybackUpdatedAt) / 1000
          : 0),
      Number.isFinite(audio.duration) ? audio.duration : null,
    );

    if (Math.abs(audio.currentTime - desiredTime) > 0.5) {
      audio.currentTime = desiredTime;
    }
    lastObservedPlaybackRef.current = desiredTime;

    if (!isReadonly && !isInteractive) {
      audio.pause();
      return;
    }

    if (syncedIsPlaying) {
      void audio.play().catch(() => {
        // Browser may block playback without a user gesture.
      });
      return;
    }

    audio.pause();
  }, [
    shape.props.url,
    isInteractive,
    isReadonly,
    syncedIsPlaying,
    syncedPlaybackPosition,
    syncedPlaybackUpdatedAt,
  ]);

  const handleFileUpload = async (file: File) => {
    if (!uploadCtx) return;
    setUploading(true);
    setUploadingFilename(file.name);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const result = await uploadFile(
        uploadCtx.roomId,
        file,
        uploadCtx.getToken,
      );
      const nextUrl = CANVAS_API + result.url;
      setDraftUrl(nextUrl);
      setUploadNotice(`Uploaded ${result.filename}`);
      onUpdateProps({
        url: nextUrl,
        isPlaying: false,
        playbackPosition: 0,
        playbackUpdatedAt: Date.now(),
      });
    } catch (err) {
      console.error("[audio-player] Upload failed:", err);
      setUploadNotice(null);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingFilename(null);
    }
  };

  const filename = shape.props.url
    ? decodeURIComponent(shape.props.url.split("/").pop() ?? "audio")
    : "";

  const commitDraftUrl = () => {
    const value = draftUrl.trim();
    if (value === shape.props.url) {
      return false;
    }

    setUploadNotice(null);
    onUpdateProps({
      url: value,
      isPlaying: false,
      playbackPosition: 0,
      playbackUpdatedAt: Date.now(),
    });

    return true;
  };

  const openFilePicker = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const syncPlayback = (
    nextIsPlaying: boolean,
    nextPosition = audioRef.current?.currentTime ?? syncedPlaybackPosition,
  ) => {
    const clampedPosition = clampPlaybackPosition(
      nextPosition,
      Number.isFinite(duration) ? duration : null,
    );

    const now = Date.now();
    lastSharedPlaybackRef.current = now;
    setDisplayTime(clampedPosition);
    onUpdateProps({
      isPlaying: nextIsPlaying,
      playbackPosition: clampedPosition,
      playbackUpdatedAt: now,
    });
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (syncedIsPlaying) {
      audioRef.current.pause();
      syncPlayback(false, audioRef.current.currentTime);
      return;
    }

    void audioRef.current
      .play()
      .then(() => {
        syncPlayback(true, audioRef.current?.currentTime ?? 0);
      })
      .catch((error) => {
        console.error("[audio-player] play() failed:", error);
      });
  };

  const updateScrubPosition = (nextPosition: number) => {
    const clampedPosition = clampPlaybackPosition(
      nextPosition,
      Number.isFinite(duration) ? duration : null,
    );

    setScrubTime(clampedPosition);
    setDisplayTime(clampedPosition);

    if (audioRef.current) {
      audioRef.current.currentTime = clampedPosition;
    }
  };

  const commitScrubPosition = (nextPosition?: number) => {
    const resolvedPosition =
      nextPosition ??
      scrubTime ??
      audioRef.current?.currentTime ??
      syncedPlaybackPosition;
    syncPlayback(syncedIsPlaying, resolvedPosition);
    setScrubTime(null);
  };

  const cancelScrubPosition = () => {
    setScrubTime(null);
    const restoredPosition = getAudioSyncedPlaybackPosition(shape.props);
    setDisplayTime(restoredPosition);

    if (audioRef.current) {
      audioRef.current.currentTime = clampPlaybackPosition(
        restoredPosition,
        Number.isFinite(duration) ? duration : null,
      );
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(
      Number.isFinite(audioRef.current.duration)
        ? audioRef.current.duration
        : 0,
    );
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const currentTime = audioRef.current.currentTime;
    const previousTime = lastObservedPlaybackRef.current;
    lastObservedPlaybackRef.current = currentTime;
    if (scrubTime !== null) return;
    setDisplayTime(currentTime);

    const didLoopWrap =
      !isReadonly &&
      syncedIsPlaying &&
      shape.props.loop &&
      currentTime + Math.max(0.5, duration * 0.25) < previousTime;

    if (didLoopWrap) {
      const now = Date.now();
      lastSharedPlaybackRef.current = now;
      onUpdateProps({
        playbackPosition: currentTime,
        playbackUpdatedAt: now,
      });
      return;
    }

    if (!isReadonly && isInteractive && syncedIsPlaying) {
      const now = Date.now();
      if (now - lastSharedPlaybackRef.current >= 750) {
        lastSharedPlaybackRef.current = now;
        onUpdateProps({
          playbackPosition: currentTime,
          playbackUpdatedAt: now,
        });
      }
    }
  };

  const handleEnded = () => {
    const nextPosition = audioRef.current?.currentTime ?? duration;
    setDisplayTime(nextPosition);
    if (!shape.props.loop) {
      syncPlayback(false, nextPosition);
    }
  };

  const handleMediaError = () => {
    const mediaError = audioRef.current?.error;
    console.error("[audio-player] media error", {
      code: mediaError?.code,
      message: mediaError?.message,
      url: shape.props.url,
    });
  };

  const sharedAudioElement = shape.props.url ? (
    // biome-ignore lint/a11y/useMediaCaption: audio-only controls in the editor do not support caption tracks
    <audio
      ref={audioRef}
      src={shape.props.url}
      loop={shape.props.loop}
      style={{ display: "none" }}
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
      onError={handleMediaError}
    />
  ) : null;

  if (isReadonly) {
    if (!shape.props.url) return null;

    return (
      <>
        {sharedAudioElement}
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            borderRadius: 8,
            background:
              isAudibleInReadonly && !isVolumeMuted
                ? "linear-gradient(135deg, rgba(24,24,27,0.88), rgba(30,64,175,0.68))"
                : "linear-gradient(135deg, rgba(24,24,27,0.88), rgba(63,63,70,0.72))",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              textAlign: "center",
              maxWidth: "100%",
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                opacity: isAudibleInReadonly && !isVolumeMuted ? 1 : 0.72,
              }}
            >
              <title>Audio source</title>
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <div
              style={{ fontSize: 11, letterSpacing: "0.18em", opacity: 0.72 }}
            >
              {isAudibleInReadonly && !isVolumeMuted ? "LIVE AUDIO" : "AUDIO"}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={filename}
            >
              {filename}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (showControls) {
    return (
      <>
        {sharedAudioElement}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "rgba(30,30,30,0.95)",
            borderRadius: 8,
            color: "#fff",
            fontFamily: "sans-serif",
            padding: 12,
            position: "relative",
            pointerEvents: "all",
            zIndex: 1,
            userSelect: "text",
          }}
          onPointerDownCapture={stopPropagation}
          onPointerUpCapture={stopPropagation}
          onPointerMoveCapture={stopPropagation}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          >
            <title>Audio player placeholder</title>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <input
            type="text"
            placeholder="Paste audio URL..."
            value={draftUrl}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDraftUrl();
              }
              e.stopPropagation();
            }}
            onBlur={() => {
              commitDraftUrl();
            }}
            onContextMenu={(e) => e.stopPropagation()}
            style={{
              width: "85%",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: 12,
              outline: "none",
              pointerEvents: "all",
            }}
          />
          <div
            style={{
              width: "85%",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {uploading ? (
              <div style={{ fontSize: 11, color: "#fbbf24" }}>
                Uploading {uploadingFilename ?? "audio file"}...
              </div>
            ) : uploadNotice ? (
              <div style={{ fontSize: 11, color: "#86efac" }}>
                {uploadNotice}
              </div>
            ) : shape.props.url ? (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.72)",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={filename}
              >
                Current file: {filename}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                No audio file selected
              </div>
            )}
            {uploadError && (
              <div
                style={{
                  fontSize: 11,
                  color: "#fca5a5",
                  maxWidth: "100%",
                }}
              >
                {uploadError}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
            onPointerDownCapture={stopPropagation}
            onPointerUpCapture={stopPropagation}
          >
            {uploadCtx ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  openFilePicker();
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.88)",
                  cursor: uploading ? "wait" : "pointer",
                  fontSize: 12,
                }}
                disabled={uploading}
              >
                {uploading
                  ? `Uploading ${uploadingFilename ?? "audio"}...`
                  : "Upload audio file"}
              </button>
            ) : null}
            {!!shape.props.url && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  setDraftUrl("");
                  setUploadNotice(null);
                  setDisplayTime(0);
                  onUpdateProps({
                    url: "",
                    isPlaying: false,
                    playbackPosition: 0,
                    playbackUpdatedAt: Date.now(),
                  });
                  setInteractiveShapeId(null);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Remove audio
              </button>
            )}
            {uploadCtx ? (
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = "";
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={uploading}
              />
            ) : null}
          </div>
          {!!shape.props.url && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  pointerEvents: "all",
                }}
                onPointerDownCapture={stopPropagation}
                onPointerUpCapture={stopPropagation}
                onPointerMoveCapture={stopPropagation}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlayback();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    togglePlayback();
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 999,
                    color: "#fff",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1,
                  }}
                  title={syncedIsPlaying ? "Pause" : "Play"}
                >
                  {syncedIsPlaying ? "⏸" : "▶"}
                </button>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      opacity: 0.74,
                    }}
                  >
                    <span>Volume</span>
                    <span>{Math.round(shape.props.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={shape.props.volume}
                    onChange={(e) => {
                      const vol = Number.parseFloat(e.target.value);
                      if (audioRef.current) {
                        audioRef.current.volume = getEffectiveMediaVolume(vol);
                      }
                      onUpdateProps({ volume: vol });
                    }}
                    style={{
                      flex: 1,
                      accentColor: "#3b82f6",
                      height: 4,
                      cursor: "pointer",
                    }}
                    title={`Volume: ${Math.round(shape.props.volume * 100)}%`}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.72,
                    minWidth: 72,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatPlaybackTime(seekPreviewTime)} /{" "}
                  {formatPlaybackTime(maxTimelineTime)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateProps({ loop: !shape.props.loop });
                  }}
                  style={{
                    background: shape.props.loop
                      ? "rgba(59,130,246,0.4)"
                      : "rgba(255,255,255,0.1)",
                    border: "none",
                    borderRadius: 4,
                    color: "#fff",
                    cursor: "pointer",
                    padding: "4px 6px",
                    fontSize: 11,
                  }}
                  title={shape.props.loop ? "Loop: ON" : "Loop: OFF"}
                >
                  🔁
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  pointerEvents: "all",
                }}
                onPointerDownCapture={stopPropagation}
                onPointerUpCapture={stopPropagation}
                onPointerMoveCapture={stopPropagation}
              >
                <input
                  type="range"
                  min={0}
                  max={Math.max(maxTimelineTime, 1)}
                  step={0.1}
                  value={Math.min(
                    seekPreviewTime,
                    Math.max(maxTimelineTime, 1),
                  )}
                  onPointerDown={() => {
                    setScrubTime(seekPreviewTime);
                  }}
                  onPointerCancel={() => {
                    cancelScrubPosition();
                  }}
                  onInput={(e) => {
                    updateScrubPosition(
                      Number.parseFloat((e.target as HTMLInputElement).value),
                    );
                  }}
                  onChange={(e) => {
                    commitScrubPosition(Number.parseFloat(e.target.value));
                  }}
                  style={{
                    flex: 1,
                    accentColor: "#60a5fa",
                    height: 4,
                    cursor: "pointer",
                  }}
                  title="Seek"
                />
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {sharedAudioElement}
      <button
        type="button"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 6,
          background: "rgba(30,30,30,0.95)",
          borderRadius: 8,
          color: "#fff",
          fontFamily: "sans-serif",
          padding: "8px 14px",
          border: "none",
          textAlign: "left",
          cursor:
            isReadonly || !shape.props.url || isInteractive
              ? "default"
              : "pointer",
        }}
        onDoubleClick={(e) => {
          if (isReadonly || !shape.props.url || isInteractive) {
            return;
          }

          e.stopPropagation();
          setInteractiveShapeId(shape.id);
          editor.setCurrentTool("select");
        }}
        onKeyDown={(e) => {
          if (isReadonly || !shape.props.url || isInteractive) {
            return;
          }

          if (e.key !== "Enter" && e.key !== " ") {
            return;
          }

          e.preventDefault();
          e.stopPropagation();
          setInteractiveShapeId(shape.id);
          editor.setCurrentTool("select");
        }}
      >
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={filename}
        >
          {filename}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              position: "relative",
              flex: 1,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${passiveProgressRatio * 100}%`,
                height: "100%",
                background: "rgba(96,165,250,0.9)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 11,
              opacity: 0.6,
              minWidth: 72,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatPlaybackTime(displayTime)} /{" "}
            {formatPlaybackTime(maxTimelineTime)}
          </span>
        </div>
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// ShapeUtil
// ---------------------------------------------------------------------------

export class AudioPlayerShapeUtil extends BaseBoxShapeUtil<AudioPlayerShape> {
  static override type = "audio-player" as const;
  static override props = audioPlayerShapeProps;

  override getDefaultProps(): AudioPlayerShape["props"] {
    return {
      w: 300,
      h: 96,
      url: "",
      volume: DEFAULT_MEDIA_VOLUME,
      loop: false,
      editorAudioEnabled: false,
      isPlaying: false,
      playbackPosition: 0,
      playbackUpdatedAt: 0,
    };
  }

  getGeometry(shape: AudioPlayerShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: AudioPlayerShape) {
    const isReadonly = this.editor.getInstanceState().isReadonly;

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          overflow: "hidden",
          borderRadius: 8,
        }}
      >
        <AudioPlayerComponent
          editor={this.editor}
          shape={shape}
          isReadonly={isReadonly}
          onUpdateProps={(props) => {
            this.editor.updateShape<AudioPlayerShape>({
              id: shape.id,
              type: "audio-player",
              props,
            });
          }}
        />
      </HTMLContainer>
    );
  }

  indicator(shape: AudioPlayerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }

  override canResize() {
    return true;
  }

  override canEdit() {
    return false;
  }

  override onResize(
    shape: AudioPlayerShape,
    info: TLResizeInfo<AudioPlayerShape>,
  ) {
    return resizeBox(shape, info);
  }
}
