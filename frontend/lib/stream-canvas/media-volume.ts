export const DEFAULT_MEDIA_VOLUME = 0.5;

export function clampMediaVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.max(0, Math.min(1, volume));
}

export function getEffectiveMediaVolume(volume: number) {
  const clamped = clampMediaVolume(volume);

  if (clamped <= 0) {
    return 0;
  }

  return clamped * clamped;
}
