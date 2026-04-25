export {
  decodePortableSettings,
  encodePortableSettings,
  isValidSettingsCode,
  normalizePortableSettingsCode,
  SETTINGS_CODE_MAX_INPUT_LENGTH,
} from "./encoding";
export { applyPortableSettings, extractPortableSettings } from "./helpers";
export { PORTABLE_PALETTE_REGISTRY } from "./registry";
export type { SingleCatPortableSettings } from "./types";
