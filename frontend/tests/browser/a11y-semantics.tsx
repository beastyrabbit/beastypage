import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { AdoptionBatchClient } from "../../components/adoption/AdoptionBatchClient";
import { AdoptionGeneratorClient } from "../../components/adoption/AdoptionGeneratorClient";
import { FoundingCoupleSelector } from "../../components/ancestry-tree/FoundingCoupleSelector";
import { ColorSwatch } from "../../components/color-palette/ColorSwatch";
import { ImageUploader } from "../../components/color-palette/ImageUploader";
import { PaletteMultiSelect } from "../../components/common/PaletteMultiSelect";
import { EvolutionTree } from "../../components/evolution/EvolutionTree";
import { SingleCatPlusClient } from "../../components/single-cat/SingleCatPlusClient";
import { VisualBuilderClient } from "../../components/visual-builder/VisualBuilderClient";
import { BackendAuthProvider } from "../../lib/data";
import { ADDITIONAL_PALETTES, type PaletteId } from "../../lib/palettes";
import "../../app/globals.css";

const catData = { params: { peltName: "SingleColour", colour: "WHITE" } };
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.origin,
  );
  let body: unknown;
  if (url.pathname.startsWith("/api/preview/"))
    return nativeFetch("/sprites/fademask.png");
  if (url.pathname === "/api/renderer") {
    // Rendering is unrelated to DOM semantics; use a real local PNG as its output.
    body = {
      image: `${location.origin}/sprites/fademask.png`,
      meta: {},
      layers: [],
    };
  } else if (url.pathname === "/api/cat-share") {
    body = { slug: "fixture-share" };
  } else if (url.pathname === "/api/cats/history") {
    body = ["Sunfur", "Moonfur"].map((catName, index) => ({
      id: `fixture-cat-${index}`,
      catName,
      creatorName: "Fixture",
      cat_data: catData,
    }));
  } else if (url.pathname === "/api/adoption/batch") {
    body = {
      id: "fixture-batch",
      title: "Fixture litter",
      cats: [
        {
          index: 0,
          label: "Sunfur",
          catName: "Sunfur",
          catData,
          previews: {
            preview: { url: "/sprites/fademask.png" },
            full: { url: "/sprites/fademask.png" },
          },
        },
      ],
    };
  } else if (url.pathname === "/api/cats/profile" && init?.method === "POST") {
    body = { id: "fixture-profile", slug: "fixture-profile" };
  } else {
    return nativeFetch(input, init);
  }
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    }),
  );
};

function Controls() {
  const [selected, setSelected] = useState(false);
  const [palettes, setPalettes] = useState<Set<PaletteId>>(
    new Set([ADDITIONAL_PALETTES[0].id]),
  );
  const [loaded, setLoaded] = useState("");
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="w-48">
        <ColorSwatch
          color={{
            hex: "#ff8800",
            rgb: { r: 255, g: 136, b: 0 },
            hsl: { h: 32, s: 100, l: 50 },
            position: { x: 0, y: 0 },
            prevalence: 75,
          }}
          index={0}
          isSelected={selected}
          onHover={() => {}}
          onSelect={() => setSelected(!selected)}
        />
      </div>
      <PaletteMultiSelect selected={palettes} onChange={setPalettes} />
      <ImageUploader
        onImageLoad={(source) =>
          setLoaded(typeof source === "string" ? source : source.name)
        }
        isLoading={false}
        error={null}
      />
      <output aria-label="Loaded image">{loaded}</output>
    </div>
  );
}

function FoundingFixture() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Select founding couple
      </button>
      <output>{selected ? "Couple selected" : "No couple selected"}</output>
      {open && (
        <FoundingCoupleSelector
          onClose={() => setOpen(false)}
          onSelect={() => {
            setSelected(true);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const view = new URL(location.href).searchParams.get("view");
let content: ReactNode;
if (view === "founding") content = <FoundingFixture />;
else if (view === "batch")
  content = <AdoptionBatchClient slug="fixture-batch" />;
else if (view === "adoption") content = <AdoptionGeneratorClient />;
else if (view === "single")
  content = <SingleCatPlusClient defaultMode="calm" />;
else if (view === "visual") content = <VisualBuilderClient />;
else if (view === "evolution")
  content = (
    <EvolutionTree
      cats={[
        {
          key: "fixture-kit",
          label: "The Kit",
          name: "Sunfur",
          level: 0,
          branchLabel: null,
          archetype: null,
          additions: [],
          rolls: [],
          previewUrl: "/sprites/fademask.png",
          href: "/view/fixture-kit",
        },
      ]}
    />
  );
else content = <Controls />;

const root = document.getElementById("root");
if (!root) throw new Error("Fixture root is missing");
createRoot(root).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <BackendAuthProvider>
      <Toaster />
      <main className="min-h-screen bg-background p-8 text-foreground">
        <button type="button">Before fixture</button>
        {content}
        <button type="button">After fixture</button>
      </main>
    </BackendAuthProvider>
  </QueryClientProvider>,
);
