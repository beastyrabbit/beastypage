export interface PoseNameMapper {
  getRenderablePoseNames?: () => string[];
  getPoseNames?: () => string[];
}

export const DEFAULT_POSE_NAME = "adult_short2";

export interface RandomPoseOptions {
  includeNewSprites?: boolean;
}

const LEGACY_SPRITE_POSE_NAMES = [
  "kitten0",
  "kitten1",
  "kitten2",
  "adolescent_short0",
  "adolescent_short1",
  "adolescent_short2",
  "adult_short0",
  "adult_short1",
  "adult_short2",
  "adult_long0",
  "adult_long1",
  "adult_long2",
  "senior0",
  "senior1",
  "senior2",
  "para_adult_short0",
  "para_adult_long0",
  "para_young0",
  "sick_adult0",
  "sick_young0",
  "newborn2",
] as const;

const LEGACY_POSE_TO_SPRITE_NUMBER: ReadonlyMap<string, number> = new Map(
  LEGACY_SPRITE_POSE_NAMES.map((poseName, spriteNumber) => [
    poseName,
    spriteNumber,
  ]),
);

function uniqueStringValues(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

export function isRandomSelectablePoseName(
  poseName: unknown,
  options: RandomPoseOptions = {},
): poseName is string {
  return (
    typeof poseName === "string" &&
    poseName.length > 0 &&
    !poseName.startsWith("newborn") &&
    !poseName.startsWith("kitten") &&
    (options.includeNewSprites === true ||
      !poseName.startsWith("adolescent_long"))
  );
}

export function getAvailablePoseNames(
  mapper: PoseNameMapper | null | undefined,
): string[] {
  const allPoses = mapper?.getPoseNames?.() ?? [];
  const renderable = mapper?.getRenderablePoseNames?.() ?? [];
  return uniqueStringValues(allPoses.length > 0 ? allPoses : renderable);
}

export function getRandomSelectablePoseNames(
  mapper: PoseNameMapper | null | undefined,
  options: RandomPoseOptions = {},
): string[] {
  const renderable = mapper?.getRenderablePoseNames?.() ?? [];
  const source =
    renderable.length > 0 ? renderable : getAvailablePoseNames(mapper);
  return uniqueStringValues(
    source.filter((poseName) => isRandomSelectablePoseName(poseName, options)),
  );
}

export const isUserSelectablePoseName = (
  poseName: unknown,
): poseName is string => typeof poseName === "string" && poseName.length > 0;
export const getUserSelectablePoseNames = getAvailablePoseNames;

export function poseNameForLegacySpriteNumber(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return LEGACY_SPRITE_POSE_NAMES[value] ?? null;
}

export function legacySpriteNumberForPoseName(poseName: unknown): number | null {
  if (typeof poseName !== "string") {
    return null;
  }
  return LEGACY_POSE_TO_SPRITE_NUMBER.get(poseName) ?? null;
}

export function formatPoseName(poseName: string): string {
  return poseName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
