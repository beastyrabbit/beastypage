import {
  T,
  createTLSchema,
  defaultShapeSchemas,
  type RecordProps,
  type TLBaseShape,
} from "tldraw";

type YouTubeEmbedShapeProps = {
  w: number;
  h: number;
  url: string;
  volume?: number;
  editorAudioEnabled?: boolean;
  isPlaying?: boolean;
  playbackPosition?: number;
  playbackUpdatedAt?: number;
};

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

type YouTubeEmbedShape = TLBaseShape<"youtube-embed", YouTubeEmbedShapeProps>;
type AudioPlayerShape = TLBaseShape<"audio-player", AudioPlayerShapeProps>;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "youtube-embed": YouTubeEmbedShapeProps;
    "audio-player": AudioPlayerShapeProps;
  }
}

export const youtubeEmbedShapeProps: RecordProps<YouTubeEmbedShape> = {
  w: T.number,
  h: T.number,
  url: T.string,
  volume: T.optional(T.number),
  editorAudioEnabled: T.optional(T.boolean),
  isPlaying: T.optional(T.boolean),
  playbackPosition: T.optional(T.number),
  playbackUpdatedAt: T.optional(T.number),
};

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

export const streamCanvasSchema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    "youtube-embed": { props: youtubeEmbedShapeProps },
    "audio-player": { props: audioPlayerShapeProps },
  },
});
