"use client";

import { createContext, type RefObject, useContext } from "react";
import type {
  BatchLiveState,
  BatchStreamCommand,
} from "@/lib/adoption/streamBatch";
import type { SingleCatSettings } from "@/utils/singleCatVariants";
import type { useVariants } from "@/utils/variants";
import type { StreamSceneButtonId } from "../sceneState";
import type { LobbyMode } from "./helpers";

type VariantsApi = ReturnType<typeof useVariants<SingleCatSettings>>;

export interface StreamControlLastResult {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  params: Record<string, unknown>;
  slots?: {
    accessories?: string[];
    scars?: string[];
    tortie?: unknown[];
  };
}

/**
 * Everything the control panels need from the shell: session-derived state,
 * generator settings, command handlers, and the share/history state for the
 * latest spin. Owned by ControlShell; consumed via useStreamControl().
 */
export interface StreamControlApi {
  // Session-derived
  testMode: boolean;
  obsUrl: string | null;
  activeScene: StreamSceneButtonId | null;
  commandBusy: boolean;
  hasWheelSource: boolean;
  generatorReady: boolean;

  // Generator settings
  settings: SingleCatSettings;
  updateSettings: (next: Partial<SingleCatSettings>) => void;
  syncSessionSettings: (updates: Record<string, unknown>) => void;
  variants: VariantsApi;
  handleVariantSelect: (variantId: string | null) => void;
  paletteDisplayMode: "cycle" | "all";
  setPaletteDisplayMode: (mode: "cycle" | "all") => void;

  // Spin + wheel
  spinning: boolean;
  wheelSpinning: boolean;
  countdownSeconds: number;
  setCountdownSeconds: (value: number) => void;
  handleSpin: () => Promise<void>;
  handleWheelSpin: () => Promise<void>;
  resultAutoClearEnabled: boolean;
  setResultAutoClearEnabled: (value: boolean) => void;
  resultAutoClearSeconds: number;
  setResultAutoClearSeconds: (value: number) => void;

  // Scene commands
  runLobbyScene: () => void;
  runBrbScene: () => void;
  runTestScene: () => void;
  runClearScene: () => void;

  // Lobby animation settings
  lobbyMode: LobbyMode;
  setLobbyMode: (mode: LobbyMode) => void;
  lobbyCatCount: number;
  setLobbyCatCount: (value: number) => void;
  lobbyMoveSpeed: number;
  setLobbyMoveSpeed: (value: number) => void;
  lobbySwapSpeed: number;
  setLobbySwapSpeed: (value: number) => void;
  lobbyCatMinSize: number;
  setLobbyCatMinSize: (value: number) => void;
  lobbyCatMaxSize: number;
  setLobbyCatMaxSize: (value: number) => void;
  lobbyAutoClearSeconds: number;
  setLobbyAutoClearSeconds: (value: number) => void;
  clearLobbyCats: () => void;

  // BRB preset
  brbSettingsCode: string;
  brbSettingsDraft: string;
  setBrbSettingsDraft: (value: string) => void;
  saveBrbSettingsCode: (rawCode: string) => Promise<boolean>;

  // Share / history for the latest spin
  shareLink: string | null;
  currentSlug: string | null;
  currentProfileId: string | null;
  hasTint: boolean;
  lastResultRef: RefObject<StreamControlLastResult | null>;
  handleDownload: () => Promise<void>;
  exportCat: (options?: { noTint?: boolean; size?: number }) => Promise<void>;
  catNameDraft: string;
  setCatNameDraft: (value: string) => void;
  creatorNameDraft: string;
  setCreatorNameDraft: (value: string) => void;
  metaDirty: boolean;
  setMetaDirty: (value: boolean) => void;
  handleSaveMeta: () => Promise<void>;
  historySaving: boolean;
  metaSaving: boolean;

  // Batch elimination show (live)
  currentBatchCommand: (BatchStreamCommand & { seq: number }) | null;
  batchLiveState: BatchLiveState | null;

  // Raw session settings snapshot — for panels with their own synced fields
  rawSessionSettings: Record<string, unknown> | null;

  // Preview
  previewContainerRef: RefObject<HTMLDivElement | null>;
}

export const StreamControlContext = createContext<StreamControlApi | null>(
  null,
);

export function useStreamControl(): StreamControlApi {
  const value = useContext(StreamControlContext);
  if (!value) {
    throw new Error("useStreamControl must be used inside ControlShell");
  }
  return value;
}
