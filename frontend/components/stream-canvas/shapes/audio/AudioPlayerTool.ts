import { BaseBoxShapeTool } from "tldraw";

export class AudioPlayerTool extends BaseBoxShapeTool {
  static override id = "audio-player";
  static override initial = "idle";
  override shapeType = "audio-player" as const;
}
