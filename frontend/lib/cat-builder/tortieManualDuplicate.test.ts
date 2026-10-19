import { describe, expect, it } from "vitest";
import {
  legacyParamsToCatDocument,
  parseCatDocumentStrict,
  readCatDocument,
} from "@/lib/cat-system";
import { decodeCatShare, prepareCatShare } from "@/lib/catShare";
import { hydrateBuilderParams } from "./genericTraitEditor";

const first = { mask: "ONE", pattern: "SingleColour", colour: "GINGER" };
const second = { ...first, mask: "TWO" };
const duplicate = { colour: "GINGER", pattern: "SingleColour", mask: "ONE" };
const tortie = [first, second, duplicate];

describe("stored duplicate tortie layers", () => {
  it("rejects duplicate legacy layers at the exported strict writer boundary", () => {
    expect(() =>
      parseCatDocumentStrict({ spriteNumber: 8, isTortie: true, tortie }),
    ).toThrow(/Duplicate list item/);
  });

  it.each(["params", "document"])(
    "never persists duplicate share slots supplied with %s",
    (source) => {
      const payload = prepareCatShare({
        ...(source === "params"
          ? { params: { spriteNumber: 8, isTortie: true, tortie } }
          : { document: { schemaVersion: 1, traits: { tortie } } }),
        tortieSlots: [first, null, second, duplicate],
        counts: { tortie: 4 },
      });
      expect(payload.document.traits.tortie).toEqual([first, second]);
      expect(payload.params.tortie).toEqual([first, second]);
      expect(payload.slots.tortie).toEqual([first, null, second]);
      expect(payload.counts.tortie).toBe(3);
    },
  );

  it("repairs legacy cats without mutating their stored input", () => {
    const input = {
      spriteNumber: 8,
      isTortie: true,
      tortie,
      peltName: "SingleColour",
      colour: "WHITE",
      eyeColour: "YELLOW",
      skinColour: "PINK",
      shading: false,
      reverse: false,
    };
    const before = structuredClone(input);
    expect(readCatDocument(input).traits.tortie).toEqual([first, second]);
    expect(input).toEqual(before);
    expect(hydrateBuilderParams(input).tortie).toEqual([first, second]);
    expect(() => legacyParamsToCatDocument(input)).toThrow(
      /Duplicate list item/,
    );
  });

  it("repairs canonical documents but keeps the strict writer rejecting duplicates", () => {
    const input = { schemaVersion: 1, traits: { tortie } };
    expect(readCatDocument(input).traits.tortie).toEqual([first, second]);
    expect(() => parseCatDocumentStrict(input)).toThrow(/Duplicate list item/);
  });

  it.each([1, 2])(
    "repairs version %s inline shares including their edit slots",
    async (v) => {
      const payload = {
        v,
        document: { schemaVersion: 1, traits: { tortie } },
        params: { spriteNumber: 8, isTortie: true, tortie },
        slots: { tortie: [first, null, second, duplicate] },
        counts: { tortie: 4 },
      };
      const share = await decodeCatShare(
        Buffer.from(JSON.stringify(payload)).toString("base64"),
      );
      expect(share?.params.tortie).toEqual([first, second]);
      expect(share?.tortieSlots).toEqual([first, null, second]);
      expect(share?.counts.tortie).toBe(3);
      expect(share?.traitSlots.tortie).toEqual([first, null, second]);
    },
  );
});
