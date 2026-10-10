import type { ParamId } from "../spinSupport";
import type { AnchorId } from "./spriteAnchors";

/** Which sprite feature a trait's caption/star points at. */
export const TRAIT_ANCHOR: Record<string, AnchorId> = {
  colour: "pelt",
  pelt: "back",
  eyeColour: "eyes",
  eyeColour2: "eyes",
  tortie: "pelt",
  tint: "tail",
  skinColour: "ear",
  whitePatches: "chest",
  points: "paw",
  whitePatchesTint: "chest",
  vitiligo: "head",
  accessory: "head",
  scar: "ear",
  sprite: "paw",
};

export function anchorForParam(paramId: ParamId): AnchorId {
  return TRAIT_ANCHOR[paramId] ?? "pelt";
}
