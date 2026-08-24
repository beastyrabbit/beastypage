export const COAT_PATTERNS = [
  {
    id: "bengal-rosettes",
    name: "Fine Bengal",
    note: "Small broken rosettes that follow the face, back, legs, and tail.",
    sourcePelts: ["Rosette", "Speckled"],
  },
  {
    id: "clouded-leopard",
    name: "Clouded rings",
    note: "One-pixel rims combined from the Classic and Sokoke swirls.",
    sourcePelts: ["Classic", "Sokoke"],
  },
  {
    id: "ocelot-chains",
    name: "Ocelot chains",
    note: "Rosette outlines broken with small marks from the Bengal frame.",
    sourcePelts: ["Rosette", "Bengal"],
  },
  {
    id: "serval-spots",
    name: "Serval spots",
    note: "Whole small marks selected from the pose-matched Speckled coat.",
    sourcePelts: ["Speckled", "Ticked"],
  },
  {
    id: "snow-leopard",
    name: "Snow rosettes",
    note: "A sparse set of Rosette marks with a few Ticked flecks.",
    sourcePelts: ["Rosette", "Ticked"],
  },
  {
    id: "tiger-stripes",
    name: "Tiger bars",
    note: "Narrow Mackerel bars trimmed against the matching Tabby frame.",
    sourcePelts: ["Mackerel", "Tabby"],
  },
  {
    id: "king-cheetah",
    name: "King cheetah",
    note: "Small Speckled marks under broken Bengal and Mackerel back marks.",
    sourcePelts: ["Speckled", "Bengal", "Mackerel"],
  },
  {
    id: "lynx-fleck",
    name: "Lynx fleck",
    note: "The original Ticked placement with a few extra one-pixel flecks.",
    sourcePelts: ["Ticked", "Speckled"],
  },
  {
    id: "marble-swirl",
    name: "Marble lace",
    note: "The rim of Marbled markings, filled where Sokoke overlaps.",
    sourcePelts: ["Marbled", "Sokoke"],
  },
  {
    id: "brindle",
    name: "Brindle bars",
    note: "Crossed Mackerel and Tabby marks that keep each limb's direction.",
    sourcePelts: ["Mackerel", "Tabby"],
  },
  {
    id: "jaguar-mosaic",
    name: "Jaguar mosaic",
    note: "Dark broken Bengal rims with smaller Rosette centres.",
    sourcePelts: ["Bengal", "Rosette"],
  },
  {
    id: "cheetah-dots",
    name: "Cheetah dots",
    note: "Small solid dots taken from Speckled, Rosette, and Bengal marks.",
    sourcePelts: ["Speckled", "Rosette", "Bengal"],
  },
  {
    id: "fishing-cat",
    name: "Fishing cat",
    note: "Short Mackerel bars mixed with isolated Speckled marks.",
    sourcePelts: ["Mackerel", "Speckled", "Bengal"],
  },
  {
    id: "toyger-braids",
    name: "Toyger braids",
    note: "Curved Bengal bars joined where Masked and Mackerel overlap.",
    sourcePelts: ["Bengal", "Mackerel", "Masked"],
  },
  {
    id: "sandcat-bars",
    name: "Sandcat bars",
    note: "A quiet set of short bars with Agouti face and tail points.",
    sourcePelts: ["Mackerel", "Ticked", "Agouti"],
  },
  {
    id: "classic-bullseye",
    name: "Classic bullseye",
    note: "One-pixel Classic rings with compact Marbled centres.",
    sourcePelts: ["Classic", "Marbled"],
  },
  {
    id: "ridgeback",
    name: "Ridgeback",
    note: "A continuous back and tail stripe edged with sparse ticks.",
    sourcePelts: ["Singlestripe", "Ticked"],
  },
  {
    id: "masked-mantle",
    name: "Masked mantle",
    note: "A broken shoulder mantle with small Smoke and Agouti points.",
    sourcePelts: ["Masked", "Ticked", "Smoke", "Agouti"],
  },
  {
    id: "ghost-stripes",
    name: "Ghost stripes",
    note: "Low-contrast Smoke marks shaped by two original stripe frames.",
    sourcePelts: ["Mackerel", "Tabby", "Smoke"],
  },
  {
    id: "split-marble",
    name: "Split marble",
    note: "Classic and Sokoke shapes split apart around dark Marbled knots.",
    sourcePelts: ["Classic", "Sokoke", "Marbled"],
  },
] as const;

export type CoatPatternId = (typeof COAT_PATTERNS)[number]["id"];
