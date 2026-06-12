"use client";

import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { type LobbySettings, OBSLobby } from "../../OBSLobby";

interface BrbSceneProps {
  settings: LobbySettings;
  generator: CatGeneratorApi | null;
}

/** BRB mode — lobby cats without the settings panel. */
export function BrbScene({ settings, generator }: BrbSceneProps) {
  return (
    <div className="relative" style={{ width: "1920px", height: "1080px" }}>
      <OBSLobby settings={settings} generator={generator} hideSettings />
    </div>
  );
}
