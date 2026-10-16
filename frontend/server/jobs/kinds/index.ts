import "server-only";

import type { AnyJobKind } from "../types";
import jobsPrune from "./jobs-prune";
import livePrune from "./live-prune";

/** Add one entry here when registering a concrete application job kind. */
export const jobKinds = [livePrune, jobsPrune] as const;

export const jobKindRegistry = new Map<string, AnyJobKind>(
  jobKinds.map(
    (definition) =>
      [definition.kind, definition as unknown as AnyJobKind] as const,
  ),
);

export function getJobKind(kind: string): AnyJobKind | undefined {
  return jobKindRegistry.get(kind);
}
