import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import Catdex from "../../app/catdex/CatdexPageClient";
import Collection from "../../app/collection/CollectionPageClient";
import Profile from "../../app/profile/page";
import { SaveTreeDialog } from "../../components/ancestry-tree/SaveTreeDialog";
import { PixelatorClient } from "../../components/pixelator/PixelatorClient";
import { QuickShareClient } from "../../components/quick-share/QuickShareClient";
import HostClient from "../../components/streamer/HostClient";
import { BackendAuthProvider, DataBackendProvider } from "../../lib/data";
import "../../app/globals.css";

function AncestrySaveFixture() {
  const [open, setOpen] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="mb-6 text-3xl">Ancestry tree save fixture</h1>
      <button
        type="button"
        className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white"
        onClick={() => setOpen(true)}
      >
        Open save dialog
      </button>
      {savedSlug && (
        <output className="mt-4 block text-sm text-emerald-400">
          Saved copy: {savedSlug}
        </output>
      )}
      {open && (
        <SaveTreeDialog
          currentName="ThunderClan Lineage"
          currentCreator="Fixture author"
          currentSlug="a-very-long-thunderclan-lineage-slug-for-fixture"
          onSave={async () => ({
            success: false,
            error: "edit_token_required",
          })}
          onSaveAsNew={async (slug) => {
            setSavedSlug(slug);
            return { success: true, slug, isNew: true };
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  );
}

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
} else if (view === "ancestry-save") {
  content = <AncestrySaveFixture />;
} else {
  content = <Collection />;
}

// The fixtures fake Convex, so they run the app's Convex-mode providers.
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <DataBackendProvider backend="convex">
      <BackendAuthProvider>
        <Toaster />
        {content}
      </BackendAuthProvider>
    </DataBackendProvider>
  </QueryClientProvider>,
);
