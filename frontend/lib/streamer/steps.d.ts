import type { CatParams } from "@/lib/cat-v3/types";
import type { TraitEditorCatalogSource } from "@/lib/cat-system/catalog";

export type StreamCatalogSource = TraitEditorCatalogSource & {
  schemaVersion?: number;
};

export type StreamerParams = CatParams & {
  _tortieLayers?: number;
  _accessorySlots?: number;
  _scarSlots?: number;
  _signupsOpen?: boolean;
  _votesOpen?: boolean;
  _disabledOptions?: Record<string, string[]>;
  _tieFilter?: string[];
  _tieIteration?: number;
  _streamerVoteKeys?: Record<string, string>;
  _finalShareSlug?: string;
  _finalShareUrl?: string;
  _finalName?: string;
  _finalCreator?: string;
  _paletteMode?: string;
};

export type StreamStep = {
  id: string;
  title: string;
  description: string;
  getOptions: (state: {
    params: StreamerParams;
    [key: string]: unknown;
  }) => Array<{
    key: string;
    label: string;
    mutate?: (
      params: StreamerParams,
      state: { params: StreamerParams; [key: string]: unknown },
    ) => void;
  }>;
  summarize: (option: { label: string }) => string;
  apply: (
    option: {
      key: string;
      label: string;
      mutate?: (
        params: StreamerParams,
        state: { params: StreamerParams; [key: string]: unknown },
      ) => void;
    },
    state: { params: StreamerParams; [key: string]: unknown },
  ) => void;
};

export function getDefaultStreamParams(): StreamerParams;
export function formatDisplayName(value: unknown): string;
export function ensureSpriteDataLoaded(): Promise<void>;
export function cloneParams<T>(params: T): T;
export function createRegistryTraitVotingSteps(
  source: StreamCatalogSource,
  state?: { params: StreamerParams },
  handledTraitIds?: Iterable<string>,
): StreamStep[];
export function createStreamSteps(
  state?: {
    params: StreamerParams;
  },
  catalogSource?: StreamCatalogSource,
): StreamStep[];
export function getStepById(steps: StreamStep[], id: string): StreamStep | null;
