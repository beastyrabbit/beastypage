export function MaintenanceBanner({ enabled }: Readonly<{ enabled: boolean }>) {
  if (!enabled) return null;
  return (
    <output
      className="block border-b border-amber-400/40 bg-amber-300/15 px-4 py-2 text-center text-sm text-amber-100"
      aria-live="polite"
    >
      BeastyPage is in maintenance mode. Reads remain available; writes are
      paused.
    </output>
  );
}
