/**
 * Minimal layout for the OBS overlay page.
 * CSS custom properties for streamer customization via OBS Custom CSS.
 * The root layout's ConvexProviderWithAuth handles the Convex connection;
 * getSessionByApiKey is a public query that doesn't require auth.
 */
export default function OBSOverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{
        "--cam-zone-width": "33.33%",
        "--accent-color": "#f59e0b",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
