/**
 * Clan signature palettes — one specially crafted 20-colour palette per
 * evolution clan, used like any other palette but themed for its line.
 */

import type { PaletteCategory } from "../types";
import { aquaclanPalette } from "./aquaclan";
import { crystalclanPalette } from "./crystalclan";
import { flareclanPalette } from "./flareclan";
import { leafclanPalette } from "./leafclan";
import { moonclanPalette } from "./moonclan";
import { roseclanPalette } from "./roseclan";
import { steelclanPalette } from "./steelclan";
import { sunclanPalette } from "./sunclan";
import { voidclanPalette } from "./voidclan";
import { voltclanPalette } from "./voltclan";

export const CLAN_SIGNATURE_PALETTES: PaletteCategory[] = [
  flareclanPalette,
  aquaclanPalette,
  leafclanPalette,
  sunclanPalette,
  roseclanPalette,
  moonclanPalette,
  voltclanPalette,
  crystalclanPalette,
  voidclanPalette,
  steelclanPalette,
];
