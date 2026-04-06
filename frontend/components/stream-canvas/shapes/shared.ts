import { defaultShapeUtils } from "tldraw";
import { YouTubeEmbedShapeUtil } from "./youtube/YouTubeEmbedShape";
import { YouTubeEmbedTool } from "./youtube/YouTubeEmbedTool";
import { AudioPlayerShapeUtil } from "./audio/AudioPlayerShape";
import { AudioPlayerTool } from "./audio/AudioPlayerTool";

/** Custom shape utils — register in both CanvasEditor and CanvasMirror. */
export const customShapeUtils = [YouTubeEmbedShapeUtil, AudioPlayerShapeUtil];

/**
 * useSync builds a store schema directly and does not merge defaults the way
 * <Tldraw /> does, so it must receive the full shape util list.
 */
export const syncShapeUtils = [...defaultShapeUtils, ...customShapeUtils];

/** Custom tools — register in CanvasEditor only (mirror is read-only). */
export const customTools = [YouTubeEmbedTool, AudioPlayerTool];
