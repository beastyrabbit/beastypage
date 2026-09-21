import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import Collection from "../../app/collection/CollectionPageClient";
import Profile from "../../app/profile/page";
import Catdex from "../../app/catdex/CatdexPageClient";
import HostClient from "../../components/streamer/HostClient";
import { QuickShareClient } from "../../components/quick-share/QuickShareClient";
import { PixelatorClient } from "../../components/pixelator/PixelatorClient";
import "../../app/globals.css";

const view = new URL(location.href).searchParams.get("view");
let content: ReactNode;
if (view === "pixelator") {
  content = (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-3xl mb-6">Pixelator</h1>
      <PixelatorClient />
    </main>
  );
} else if (view === "quick-share") {
  content = <QuickShareClient />;
} else if (view === "host") {
  content = <HostClient />;
} else if (view === "catdex") {
  content = <Catdex />;
} else if (view === "profile") {
  content = <Profile />;
} else {
  content = <Collection />;
}

createRoot(document.getElementById("root")!).render(
  <>
    <Toaster />
    {content}
  </>,
);
