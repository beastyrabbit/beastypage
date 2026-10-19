import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import StreamControlPage from "../../app/single-cat-stream/page";
import { UserAuthButton } from "../../components/auth/UserAuthButton";
import { ObsOverlayClient } from "../../components/stream-control/obs/ObsOverlayClient";
import { BackendAuthProvider } from "../../lib/data";
import "./stream-control-services";
import "../../app/globals.css";

const obs = new URL(location.href).searchParams.has("obs");
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <BackendAuthProvider>
      {obs ? (
        <ObsOverlayClient apiKey="local-stream-fixture" />
      ) : (
        <>
          <header className="flex justify-end px-8 pt-4">
            <UserAuthButton />
          </header>
          <StreamControlPage />
        </>
      )}
    </BackendAuthProvider>
  </QueryClientProvider>,
);
