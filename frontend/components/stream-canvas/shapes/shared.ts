import { YouTubeEmbedShapeUtil } from "./youtube/YouTubeEmbedShape";
import { YouTubeEmbedTool } from "./youtube/YouTubeEmbedTool";
import { AudioPlayerShapeUtil } from "./audio/AudioPlayerShape";
import { AudioPlayerTool } from "./audio/AudioPlayerTool";

/** Custom shape utils — register in both CanvasEditor and CanvasMirror. */
export const customShapeUtils = [YouTubeEmbedShapeUtil, AudioPlayerShapeUtil];

/** Custom tools — register in CanvasEditor only (mirror is read-only). */
export const customTools = [YouTubeEmbedTool, AudioPlayerTool];
