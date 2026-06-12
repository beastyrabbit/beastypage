/**
 * Pure decision logic for the OBS overlay command dispatcher.
 *
 * The overlay subscribes to `cat_stream_sessions.currentCommand` and must
 * decide, for every command it sees, whether to ignore it (already handled),
 * defer it (still initializing), replay it, restore its final state (after an
 * overlay reload), or discard it as stale. Keeping this decision pure makes
 * the reload/staleness behavior unit-testable without mounting the overlay.
 */

/** Commands that play a one-shot animation and can therefore go stale. */
const TRANSIENT_COMMAND_TYPES = new Set(["spin", "wheel"]);

export function isTransientCommand(type: string): boolean {
  return TRANSIENT_COMMAND_TYPES.has(type);
}

export interface CommandPolicyInput {
  /** Command type, e.g. "spin", "wheel", "lobby". */
  type: string;
  /** Monotonic sequence number of the command. */
  seq: number;
  /** Epoch ms when the command was issued. */
  timestamp: number;
  /** Last sequence number this overlay handled, or null if none yet. */
  lastSeq: number | null;
  /** Whether the overlay has already processed its first command. */
  initialized: boolean;
  /** True while the generator is unavailable (initializing or failed). */
  generationDisabled: boolean;
  /** True while sprite assets are still loading. */
  initializing: boolean;
  /** Whether results auto-clear after a delay. */
  resultAutoClearEnabled: boolean;
  /** Auto-clear delay in seconds (used for staleness on reload). */
  resultAutoClearSeconds: number;
  /** Current epoch ms. */
  now: number;
}

export type CommandDecision =
  /** Sequence already handled — do nothing. */
  | "ignore"
  /** Generator not ready yet — leave the command unmarked so it replays once ready. */
  | "defer"
  /** Generator failed — mark the command seen and skip it. */
  | "skip"
  /** First command after a reload with auto-clear off — restore the final result without replaying. */
  | "restore"
  /** First command after a reload but older than the auto-clear window — clear to idle. */
  | "discard-stale"
  /** Handle the command normally. */
  | "dispatch";

export function decideCommandAction(
  input: CommandPolicyInput,
): CommandDecision {
  const transient = isTransientCommand(input.type);

  if (input.lastSeq !== null && input.seq <= input.lastSeq) {
    return "ignore";
  }

  if (transient && input.generationDisabled) {
    return input.initializing ? "defer" : "skip";
  }

  if (!input.initialized && transient) {
    if (!input.resultAutoClearEnabled) {
      return "restore";
    }
    const commandAgeMs = input.now - input.timestamp;
    const staleAfterMs = input.resultAutoClearSeconds * 1000 + 1500;
    if (Number.isFinite(commandAgeMs) && commandAgeMs > staleAfterMs) {
      return "discard-stale";
    }
  }

  return "dispatch";
}
