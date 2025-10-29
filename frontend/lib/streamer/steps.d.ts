export type StreamerParams = {
  spriteNumber: number;
  peltName: string;
  colour: string;
  isTortie: boolean;
  tortie?: Array<{ pattern?: string; colour?: string; mask?: string } | null>;
  tortiePattern?: string;
  tortieColour?: string;
  tortieMask?: string;
  eyeColour: string;
  eyeColour2?: string;
  skinColour: string;
  whitePatches?: string;
  whitePatchesTint?: string;
  points?: string;
  vitiligo?: string;
  tint?: string;
  shading: boolean;
  reverse: boolean;
  accessories?: Array<string | null>;
  accessory?: string;
  scars?: Array<string | null>;
  scar?: string;
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
  [key: string]: unknown;
};

export type StreamStep = {
  id: string;
  title: string;
  description: string;
  getOptions: (state: { params: StreamerParams; [key: string]: unknown }) => Array<{
    key: string;
    label: string;
    mutate?: (params: StreamerParams, state: { params: StreamerParams; [key: string]: unknown }) => void;
  }>;
  summarize: (option: { label: string }) => string;
  apply: (
    option: { key: string; label: string; mutate?: (params: StreamerParams, state: { params: StreamerParams; [key: string]: unknown }) => void },
    state: { params: StreamerParams; [key: string]: unknown }
  ) => void;
};

export function getDefaultStreamParams(): StreamerParams;
export function formatDisplayName(value: unknown): string;
export function ensureSpriteDataLoaded(): Promise<void>;
export function cloneParams<T>(params: T): T;
export function createStreamSteps(state?: { params: StreamerParams }): StreamStep[];
export function getStepById(steps: StreamStep[], id: string): StreamStep | null;
