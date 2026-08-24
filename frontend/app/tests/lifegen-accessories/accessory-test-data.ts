export const NEW_ACCESSORY_POSES = [
  { id: "adolescent_long0", label: "Long 0" },
  { id: "adolescent_long1", label: "Long 1" },
  { id: "adolescent_long2", label: "Long 2" },
] as const;

export type AccessoryExceptionKind = "adapted" | "renamed";

export interface AccessoryException {
  name: string;
  kind: AccessoryExceptionKind;
  source: string;
}

export const ACCESSORY_EXCEPTIONS: readonly AccessoryException[] = [
  { name: "ACORN2", kind: "adapted", source: "ACORN" },
  {
    name: "BLEEDING HEARTS2",
    kind: "adapted",
    source: "BLEEDING HEART BRANCH",
  },
  { name: "CHERRY2", kind: "adapted", source: "CHERRY" },
  { name: "CLOVER2", kind: "adapted", source: "SINGULARCLOVER" },
  { name: "CLOVERS", kind: "adapted", source: "CLOVERFLOWER" },
  { name: "FERNS", kind: "adapted", source: "FERN" },
  { name: "HESPERIS", kind: "adapted", source: "DIANTHUS" },
  { name: "LADYBUG", kind: "adapted", source: "RED LADYBUG" },
  { name: "LARGE COMET", kind: "adapted", source: "COMET MOTH" },
  { name: "LARGE LUNA", kind: "adapted", source: "LUNAR MOTH" },
  { name: "LILYPADCROWN", kind: "adapted", source: "LILYPADHAT" },
  { name: "MARIGOLD", kind: "adapted", source: "ALLIUM" },
  { name: "MOSS2", kind: "adapted", source: "MOSS" },
  {
    name: "RASPBERRY2",
    kind: "adapted",
    source: "GOLDEN RASPBERRY",
  },
  { name: "REDCROWN", kind: "adapted", source: "PINKFLOWERCROWN" },
  { name: "SMALL COMET", kind: "adapted", source: "COMET MOTH" },
  { name: "SMALL LUNA", kind: "adapted", source: "LUNAR MOTH" },
  { name: "YELLOW PRIMROSE", kind: "adapted", source: "DIANTHUS" },
  {
    name: "YELLOWCROWN",
    kind: "adapted",
    source: "YELLOWFLOWERCROWN",
  },
  {
    name: "JAYFEATHER",
    kind: "adapted",
    source: "DRACULAPARROTFEATHER",
  },
  { name: "HOLLY2", kind: "renamed", source: "HOLLYLEAVES" },
  {
    name: "SPRINGFEATHERS",
    kind: "renamed",
    source: "SPINGFEATHERS",
  },
] as const;

export const LIFEGEN_ACCESSORY_EXAMPLES = [
  "ATLAS MOTH",
  "ZEBRA ISOPOD",
  "BLACK AND WHITE RABBIT",
  "ORANGE SLICE",
  "BEEHARNESS",
  "BLUERAINCOAT",
  "LILYPADHAT",
  "BLEEDING HEART BRANCH",
  "MOONHAT",
  "WILLOWBARK BAG",
] as const;
