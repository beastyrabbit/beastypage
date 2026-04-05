import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stream Canvas OBS | BeastyPage",
  description: "OBS browser source for Stream Canvas overlay.",
};

/**
 * OBS overlay layout — forces full transparency and hides all site chrome.
 * Uses both `background` and `background-color` for max compat with OBS Chromium.
 */
export default function StreamCanvasOBSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        *, *::before, *::after {
          background-color: transparent !important;
          background-image: none !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          background-color: rgba(0,0,0,0) !important;
          overflow: hidden !important;
        }
        header, footer, .sonner-toaster, .tl-watermark_SEE-LICENSE {
          display: none !important;
        }
        .obs-mirror {
          --tl-color-background: rgba(0,0,0,0) !important;
        }
        /* Defensive: tldraw frame shapes (if any exist in the document) render a white SVG rect — force transparent for OBS */
        rect.tl-frame__body {
          fill: transparent !important;
        }
        .tl-frame-heading {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
