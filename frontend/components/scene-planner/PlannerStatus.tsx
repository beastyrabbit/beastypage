"use client";

import { usePlanner } from "./usePlanner";

export function PlannerStatus() {
  const { status } = usePlanner();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      <span key={status.id}>{status.text}</span>
    </div>
  );
}
