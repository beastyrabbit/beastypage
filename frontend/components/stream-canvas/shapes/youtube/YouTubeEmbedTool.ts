import { BaseBoxShapeTool } from "tldraw";

export class YouTubeEmbedTool extends BaseBoxShapeTool {
  static override id = "youtube-embed";
  static override initial = "idle";
  override shapeType = "youtube-embed" as const;
}
