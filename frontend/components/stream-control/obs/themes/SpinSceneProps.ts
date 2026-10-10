import type { RefObject } from "react";
import type { SpriteMapperApi } from "@/components/cat-builder/types";
import type { AfterlifeOption } from "@/utils/singleCatVariants";
import type { ParamTimingKey } from "@/utils/spinTiming";
import type { OBSClassicWheelHandle } from "../../OBSClassicWheel";
import type {
  LayerGroup,
  LayerRowState,
  ParamId,
  ParamRow,
  WheelRewardState,
} from "../spinSupport";
import type { SpriteAnchors } from "./spriteAnchors";
import type { OverlayThemeId } from "./themeMeta";

/**
 * Everything a themed spin scene receives. The spin engine in
 * ObsOverlayClient owns all of this state; scenes are pure renderers and
 * must mount exactly one <CatCanvas canvasRef={canvasRef}>.
 */
export interface SpinSceneProps {
  // ── Existing SpinBoard contract (unchanged) ───────────────────────────
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wheelRef: RefObject<OBSClassicWheelHandle | null>;
  spinVisible: boolean;
  initializing: boolean;
  wheelReward: WheelRewardState;
  wheelBannerVisible: boolean;
  /** Display rows in PARAM_SEQUENCE order; `raw` is set once a value is revealed. */
  paramRows: ParamRow[];
  layerRows: Record<LayerGroup, LayerRowState[]>;
  flashParamId: ParamId | null;
  flashLayerKey: string | null;
  rollerLabel: string | null;
  rollerActiveValue: string | null;
  spinDone: boolean;
  /** Share URL of the saved result; render a QR when set. */
  viewUrl: string | null;
  /** Spread/crop layout — honoured by classic only. */
  spread: boolean;

  // ── Theme additions ───────────────────────────────────────────────────
  theme: OverlayThemeId;
  /** `session.currentCommand.seq` — the "Spin 427" number. */
  spinSeq: number | null;
  /** Param rolling right now (null between params and when done). */
  activeParamId: ParamId | null;
  /** `performance.now()` when the active param started rolling. */
  activeParamStartedAt: number | null;
  /** Actual ms spent per param so far (mirrors the engine's timing refs). */
  paramDurations: Partial<Record<ParamTimingKey, number>>;
  totalDurationMs: number;
  /** Pose currently drawn on the canvas (DEFAULT_POSE_NAME until the sprite step lands). */
  poseName: string;
  /** Whether the drawn cat is mirrored. */
  reverse: boolean;
  /** Feature anchors for `poseName`/`reverse`, in 0..50 sprite units; null while loading. */
  anchors: SpriteAnchors | null;
  /** Sprite mapper for colour swatches; null before the generator is ready. */
  mapper: SpriteMapperApi | null;
  afterlife: AfterlifeOption;
}
