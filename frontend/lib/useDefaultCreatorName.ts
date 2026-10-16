"use client";

import { useUserViewer } from "@/lib/data/users";

/**
 * Returns the authenticated user's username, or "" if not signed in / no username set.
 * Use as a fallback default for "Creator Name" / "Your Name" fields.
 */
export function useDefaultCreatorName(): string {
  const viewer = useUserViewer();
  return viewer?.username ?? "";
}
