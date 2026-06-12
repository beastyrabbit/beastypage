"use client";

import { ControlShell } from "./control/ControlShell";

/**
 * Stream control page entry point — the implementation lives in
 * ./control/ControlShell and its tab panels.
 */
export function StreamControlClient() {
  return <ControlShell />;
}
