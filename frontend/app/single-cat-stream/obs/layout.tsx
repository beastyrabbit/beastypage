/**
 * Fixed 1920x1080 layout for the OBS overlay page.
 * OBS browser sources are always set to a specific resolution —
 * this layout renders at exactly 1920x1080px, no responsive scaling.
 */
export default function OBSOverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed left-0 top-0 z-[9999] overflow-hidden"
      style={{
        width: "1920px",
        height: "1080px",
        "--cam-zone-width": "640px",
        "--content-width": "1280px",
        "--accent-color": "#f59e0b",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
