"use client";

import type { ComponentType } from "react";
import { AllegiancesLineage } from "./allegiances/AllegiancesLineage";
import { ClassicLineage } from "./classic/ClassicLineage";
import { ContactLineage } from "./contact/ContactLineage";
import { HandheldLineage } from "./handheld/HandheldLineage";
import type { LineageBoardProps } from "./LookBoardProps";
import { SHOW_LOOK_META, type ShowLookId, type ShowLookMeta } from "./lookMeta";
import { StickerLineage } from "./sticker/StickerLineage";
import { StrataLineage } from "./strata/StrataLineage";
import { TerritoryLineage } from "./territory/TerritoryLineage";

export interface ShowLookDefinition extends ShowLookMeta {
  /** Evolution ceremony + lineage finale board. */
  Lineage: ComponentType<LineageBoardProps>;
}

const BOARDS: Record<ShowLookId, ComponentType<LineageBoardProps>> = {
  classic: ClassicLineage,
  allegiances: AllegiancesLineage,
  handheld: HandheldLineage,
  strata: StrataLineage,
  contact: ContactLineage,
  territory: TerritoryLineage,
  sticker: StickerLineage,
};

export const SHOW_LOOKS: Record<ShowLookId, ShowLookDefinition> =
  Object.fromEntries(
    (Object.keys(SHOW_LOOK_META) as ShowLookId[]).map((id) => [
      id,
      { ...SHOW_LOOK_META[id], Lineage: BOARDS[id] },
    ]),
  ) as Record<ShowLookId, ShowLookDefinition>;

export function getShowLook(id: ShowLookId): ShowLookDefinition {
  return SHOW_LOOKS[id];
}
