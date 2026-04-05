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

// ---------------------------------------------------------------------------
// Shape type
// ---------------------------------------------------------------------------

type YouTubeEmbedShapeProps = { w: number; h: number; url: string };

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

// ---------------------------------------------------------------------------
// ShapeUtil
// ---------------------------------------------------------------------------

export class YouTubeEmbedShapeUtil extends BaseBoxShapeUtil<YouTubeEmbedShape> {
  static override type = "youtube-embed" as const;
  static override props = youtubeEmbedShapeProps;

  override getDefaultProps(): YouTubeEmbedShape["props"] {
    return { w: 480, h: 270, url: "" };
  }

  getGeometry(shape: YouTubeEmbedShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: YouTubeEmbedShape) {
    const videoId = extractYouTubeId(shape.props.url);
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const isReadonly = this.editor.getInstanceState().isReadonly;

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
        {videoId && !isEditing ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              pointerEvents: isReadonly ? "auto" : "auto",
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
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
            }}
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
                  placeholder="https://youtube.com/watch?v=..."
                  defaultValue={shape.props.url}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = (e.target as HTMLInputElement).value;
                      this.editor.updateShape<YouTubeEmbedShape>({
                        id: shape.id,
                        type: "youtube-embed",
                        props: { url: value },
                      });
                      this.editor.setEditingShape(null);
                    }
                    e.stopPropagation();
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value !== shape.props.url) {
                      this.editor.updateShape<YouTubeEmbedShape>({
                        id: shape.id,
                        type: "youtube-embed",
                        props: { url: value },
                      });
                    }
                  }}
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
                  }}
                  autoFocus={isEditing}
                />
              </>
            )}
          </div>
        )}
      </HTMLContainer>
    );
  }

  indicator(shape: YouTubeEmbedShape) {
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

  override isAspectRatioLocked() {
    return false;
  }

  override canEdit() {
    return true;
  }

  override onResize(
    shape: YouTubeEmbedShape,
    info: TLResizeInfo<YouTubeEmbedShape>,
  ) {
    return resizeBox(shape, info);
  }
}
