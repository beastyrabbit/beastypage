export interface PoseNameMapper {
  getRenderablePoseNames?: () => string[];
  getPoseNames?: () => string[];
}

export const DEFAULT_POSE_NAME = "adult_short2";

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
): poseName is string {
  return (
    typeof poseName === "string" &&
    poseName.length > 0 &&
    !poseName.startsWith("newborn") &&
    !poseName.startsWith("kitten") &&
    !poseName.startsWith("adolescent_long")
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
): string[] {
  const renderable = mapper?.getRenderablePoseNames?.() ?? [];
  const source =
    renderable.length > 0 ? renderable : getAvailablePoseNames(mapper);
  return uniqueStringValues(source.filter(isRandomSelectablePoseName));
}

export const isUserSelectablePoseName = isRandomSelectablePoseName;
export const getUserSelectablePoseNames = getRandomSelectablePoseNames;

export function formatPoseName(poseName: string): string {
  return poseName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
