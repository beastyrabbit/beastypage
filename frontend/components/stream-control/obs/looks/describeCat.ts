/**
 * One-line prose for a cat, book-roster style: "silver tabby with green
 * eyes and white patches, wearing a red collar". Built only from the legacy
 * flat params every stream payload carries.
 */

import type { CatParams } from "@/lib/cat-v3/types";

function words(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

const NONE = new Set(["", "none", "null", "no", "false", "solid"]);

function isSet(value: string | undefined | null): value is string {
  return !!value && !NONE.has(value.trim().toLowerCase());
}

export function describeCat(
  params: Partial<CatParams> | null | undefined,
): string {
  if (!params) return "a cat";
  const colour = words(params.colour);
  const pelt = words(params.peltName);
  const coat =
    pelt === "single" || pelt === "singlecolour" || pelt === ""
      ? colour || "plain"
      : [colour, pelt].filter(Boolean).join(" ");
  const parts: string[] = [];
  parts.push(params.isTortie ? `${coat} tortoiseshell` : coat);

  const eyes = words(params.eyeColour);
  const eyes2 = words(params.eyeColour2);
  if (eyes && eyes2 && eyes2 !== eyes) {
    parts.push(`with one ${eyes} and one ${eyes2} eye`);
  } else if (eyes) {
    parts.push(`with ${eyes} eyes`);
  }

  if (isSet(params.whitePatches)) parts.push("and white patches");
  else if (isSet(params.points)) parts.push("and pale points");
  if (isSet(params.vitiligo)) parts.push("flecked with vitiligo");

  const accessory = words(params.accessory);
  if (isSet(params.accessory)) parts.push(`wearing ${accessory}`);

  return parts.join(" ");
}
