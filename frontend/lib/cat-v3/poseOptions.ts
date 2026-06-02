export interface PoseNameMapper {
  getRenderablePoseNames?: () => string[];
  getPoseNames?: () => string[];
}

export const DEFAULT_POSE_NAME = "adult_short2";

export interface RandomPoseOptions {
  includeNewSprites?: boolean;
}

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

export function formatPoseName(poseName: string): string {
  return poseName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
