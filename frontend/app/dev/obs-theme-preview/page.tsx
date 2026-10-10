import { Suspense } from "react";
import { ThemePreviewClient } from "./ThemePreviewClient";

/**
 * DEV HARNESS — renders any overlay theme's spin scene with mock data so it
 * can be designed without Convex, the renderer, or a live stream session.
 *
 *   /dev/obs-theme-preview?theme=plate&state=rolling&pose=adult_short2&wheel=1
 *
 * Not linked from anywhere. Delete before release if it should not ship.
 */
export default function ObsThemePreviewPage() {
  return (
    <Suspense>
      <ThemePreviewClient />
    </Suspense>
  );
}
