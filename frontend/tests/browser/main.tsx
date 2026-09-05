import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import Collection from "../../app/collection/CollectionPageClient";
import Profile from "../../app/profile/page";
import { PixelatorClient } from "../../components/pixelator/PixelatorClient";
import "../../app/globals.css";

const view = new URL(location.href).searchParams.get("view");
createRoot(document.getElementById("root")!).render(
  <>
    <Toaster />
    {view === "pixelator" ? (
      <main className="mx-auto max-w-6xl p-8">
        <h1 className="text-3xl mb-6">Pixelator</h1>
        <PixelatorClient />
      </main>
    ) : view === "profile" ? (
      <Profile />
    ) : (
      <Collection />
    )}
  </>,
);
