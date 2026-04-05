import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type RecordProps,
  type TLBaseShape,
  type TLResizeInfo,
  T,
  resizeBox,
} from "tldraw";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/stream-canvas/api";

// ---------------------------------------------------------------------------
// Shape type
// ---------------------------------------------------------------------------

type AudioPlayerShapeProps = {
  w: number;
  h: number;
  url: string;
  volume: number;
  loop: boolean;
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
};

// ---------------------------------------------------------------------------
// Context for file upload (provided by CanvasEditor)
// ---------------------------------------------------------------------------

export interface AudioUploadContext {
  roomId: string;
  getToken: () => Promise<string | null>;
}

export const AudioUploadCtx = createContext<AudioUploadContext | null>(null);

// ---------------------------------------------------------------------------
// Audio player component (used inside the shape)
// ---------------------------------------------------------------------------

const CANVAS_API =
  process.env.NEXT_PUBLIC_CANVAS_API_URL ??
  "https://stream-canvas.localhost:1355";

function AudioPlayerComponent({
  shape,
  isReadonly,
  onUpdateProps,
}: {
  shape: AudioPlayerShape;
  isReadonly: boolean;
  onUpdateProps: (props: Partial<AudioPlayerShape["props"]>) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadCtx = useContext(AudioUploadCtx);

  // Auto-play in OBS mirror (read-only mode)
  useEffect(() => {
    if (isReadonly && shape.props.url && audioRef.current) {
      audioRef.current.volume = shape.props.volume;
      audioRef.current.loop = shape.props.loop;
      audioRef.current.play().catch(() => {
        // Browser may block autoplay — OBS Chromium usually allows it
      });
    }
  }, [isReadonly, shape.props.url, shape.props.volume, shape.props.loop]);

  // Sync volume/loop changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = shape.props.volume;
      audioRef.current.loop = shape.props.loop;
    }
  }, [shape.props.volume, shape.props.loop]);

  const handleFileUpload = async (file: File) => {
    if (!uploadCtx) return;
    setUploading(true);
    try {
      const result = await uploadFile(
        uploadCtx.roomId,
        file,
        uploadCtx.getToken,
      );
      onUpdateProps({ url: `${CANVAS_API}${result.url}` });
    } catch (err) {
      console.error("[audio-player] Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const filename = shape.props.url
    ? decodeURIComponent(shape.props.url.split("/").pop() ?? "audio")
    : "";

  // OBS mirror: hidden player that auto-plays
  if (isReadonly) {
    if (!shape.props.url) return null;
    return (
      <div style={{ width: "100%", height: "100%", background: "transparent" }}>
        <audio
          ref={audioRef}
          src={shape.props.url}
          autoPlay
          loop={shape.props.loop}
        />
      </div>
    );
  }

  // Editor: no URL set — show input + file picker
  if (!shape.props.url) {
    return (
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
        }}
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
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <input
          type="text"
          placeholder="Paste audio URL..."
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) onUpdateProps({ url: value });
            }
            e.stopPropagation();
          }}
          style={{
            width: "85%",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            fontSize: 12,
            outline: "none",
          }}
        />
        {uploadCtx && (
          <label
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              cursor: uploading ? "wait" : "pointer",
              textDecoration: "underline",
            }}
          >
            {uploading ? "Uploading..." : "or upload a file"}
            <input
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={uploading}
            />
          </label>
        )}
      </div>
    );
  }

  // Editor: URL set — show player controls
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        background: "rgba(30,30,30,0.95)",
        borderRadius: 8,
        color: "#fff",
        fontFamily: "sans-serif",
        padding: "8px 14px",
      }}
    >
      <audio ref={audioRef} src={shape.props.url} loop={shape.props.loop} />

      {/* Filename */}
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

      {/* Controls row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Play / Pause */}
        <button
          type="button"
          onClick={() => {
            if (!audioRef.current) return;
            if (playing) {
              audioRef.current.pause();
              setPlaying(false);
            } else {
              audioRef.current.play();
              setPlaying(true);
            }
          }}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: 4,
            color: "#fff",
            cursor: "pointer",
            padding: "4px 8px",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Volume */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={shape.props.volume}
          onChange={(e) => {
            const vol = Number.parseFloat(e.target.value);
            if (audioRef.current) audioRef.current.volume = vol;
            onUpdateProps({ volume: vol });
          }}
          style={{ flex: 1, accentColor: "#3b82f6", height: 4 }}
          title={`Volume: ${Math.round(shape.props.volume * 100)}%`}
        />

        {/* Loop toggle */}
        <button
          type="button"
          onClick={() => onUpdateProps({ loop: !shape.props.loop })}
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

        {/* Clear URL */}
        <button
          type="button"
          onClick={() => {
            if (audioRef.current) audioRef.current.pause();
            setPlaying(false);
            onUpdateProps({ url: "" });
          }}
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: 4,
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            padding: "4px 6px",
            fontSize: 11,
          }}
          title="Remove audio"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShapeUtil
// ---------------------------------------------------------------------------

export class AudioPlayerShapeUtil extends BaseBoxShapeUtil<AudioPlayerShape> {
  static override type = "audio-player" as const;
  static override props = audioPlayerShapeProps;

  override getDefaultProps(): AudioPlayerShape["props"] {
    return { w: 300, h: 80, url: "", volume: 0.8, loop: false };
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
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
      />
    );
  }

  override canResize() {
    return true;
  }

  override canEdit() {
    return true;
  }

  override onResize(
    shape: AudioPlayerShape,
    info: TLResizeInfo<AudioPlayerShape>,
  ) {
    return resizeBox(shape, info);
  }
}
