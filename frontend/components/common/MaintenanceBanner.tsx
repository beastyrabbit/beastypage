export function MaintenanceBanner({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div
      className="border-b border-amber-400/40 bg-amber-300/15 px-4 py-2 text-center text-sm text-amber-100"
      role="status"
    >
      BeastyPage is in maintenance mode. Reads remain available; writes are
      paused.
    </div>
  );
}
