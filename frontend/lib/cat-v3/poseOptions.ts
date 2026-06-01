export interface PoseNameMapper {
  getRenderablePoseNames?: () => string[];
  getPoseNames?: () => string[];
}

export const DEFAULT_POSE_NAME = "adult_short2";

export function isUserSelectablePoseName(
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

export function getUserSelectablePoseNames(
  mapper: PoseNameMapper | null | undefined,
): string[] {
  const renderable = mapper?.getRenderablePoseNames?.() ?? [];
  const source =
    renderable.length > 0 ? renderable : (mapper?.getPoseNames?.() ?? []);
  return Array.from(new Set(source.filter(isUserSelectablePoseName)));
}

export function formatPoseName(poseName: string): string {
  return poseName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
