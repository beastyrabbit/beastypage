"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Returns the authenticated user's username, or "" if not signed in / no username set.
 * Use as a fallback default for "Creator Name" / "Your Name" fields.
 */
export function useDefaultCreatorName(): string {
  const viewer = useQuery(api.users.viewer);
  return viewer?.username ?? "";
}
