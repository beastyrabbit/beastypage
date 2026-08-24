import { describe, expect, it } from "vitest";
import { COAT_PATTERN_IDS } from "@/lib/cat-v3/coatPatterns";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  applyParamValue,
  buildParameterOptions,
  type SpriteMapperApi,
} from "./spinSupport";

describe("OBS progressive pelt options", () => {
  it("includes every derived coat pattern", async () => {
    const mapper: SpriteMapperApi = {
      loaded: true,
      init: async () => true,
      getPeltNames: () => ["SingleColour", "Tabby", "Tortie", "Calico"],
    };

    const options = await buildParameterOptions(mapper, true, [], true);

    expect(options.pelt).toEqual(expect.arrayContaining(COAT_PATTERN_IDS));
  });

  it("applies derived coats and clears them when a base pelt is selected", () => {
    const params: Partial<CatParams> = { peltName: "Tabby" };

    for (const coatPattern of COAT_PATTERN_IDS) {
      applyParamValue(params, "pelt", coatPattern);
      expect(params.peltName).toBe("SingleColour");
      expect(params.coatPattern).toBe(coatPattern);
    }

    applyParamValue(params, "pelt", "Mackerel");
    expect(params.peltName).toBe("Mackerel");
    expect(params).not.toHaveProperty("coatPattern");
  });
});
