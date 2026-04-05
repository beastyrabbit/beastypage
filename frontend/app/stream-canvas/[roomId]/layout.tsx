/**
 * Canvas room layout — hides site chrome, full viewport canvas.
 */
export default function CanvasRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        header, footer { display: none !important; }
        .min-h-screen { min-height: auto !important; }
        body { overflow: hidden !important; }
      `}</style>
      {children}
    </>
  );
}
