// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  adoptionBatchSettingsShape,
  ancestryCats,
  catData,
  catProfileData,
  catShareData,
  catStreamCommand,
  catStreamSettings,
  jsonValue,
  paletteGeneratorConfig,
  perfectCatParams,
  streamParams,
  streamVoteOptionMeta,
  userVariantSettingsByTool,
} from "./contracts";

const params = {
  spriteNumber: 8,
  peltName: "Tabby",
  colour: "GINGER",
  isTortie: false,
  eyeColour: "YELLOW",
  skinColour: "PINK",
  shading: false,
  reverse: false,
  accessories: ["COLLAR", null],
};

describe("JSON contracts", () => {
  it("accepts every saved-cat producer shape", () => {
    const spin = {
      params,
      accessorySlots: ["COLLAR", "none"],
      scarSlots: [],
      tortieSlots: [null],
      counts: { accessories: 1, scars: 0, tortie: 0 },
    };
    const guided = {
      mode: "wizard-timeline",
      version: 1,
      steps: [{ id: "pelt", title: "Pelt", summary: "Tabby", params }],
      finalParams: params,
      metaLocked: true,
    };
    const legacyDiscord = {
      ...params,
      pose_name: "adult_short0",
      source: "discordkitten",
    };
    for (const value of [spin, guided, legacyDiscord, {}]) {
      expect(catData.safeParse(value).success).toBe(true);
    }
  });

  it("rejects wrongly typed known keys instead of coercing them", () => {
    expect(
      catData.safeParse({ params: { ...params, spriteNumber: "8" } }).success,
    ).toBe(false);
    expect(catData.safeParse({ accessorySlots: "COLLAR" }).success).toBe(false);
  });

  it("rejects values JSON cannot round-trip", () => {
    expect(jsonValue.safeParse(Number.NaN).success).toBe(false);
    expect(jsonValue.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(catData.safeParse({ extra: undefined }).success).toBe(false);
    expect(catData.safeParse({ when: new Date() }).success).toBe(false);
  });

  it("enforces the size caps Convex enforced", () => {
    const big = { blob: "x".repeat(901 * 1024) };
    expect(catProfileData.safeParse(big).success).toBe(false);
    expect(
      perfectCatParams.safeParse({ params: { blob: "x".repeat(33 * 1024) } })
        .success,
    ).toBe(false);
  });

  it("accepts both cat share payload versions and nothing else", () => {
    const document = { schemaVersion: 1, traits: { pelt: "Tabby" } };
    expect(
      catShareData.safeParse({
        v: 1,
        document,
        params,
        slots: { scars: [] },
        counts: {},
      }).success,
    ).toBe(true);
    expect(catShareData.safeParse({ v: 2, document }).success).toBe(true);
    expect(catShareData.safeParse({ v: 3, document }).success).toBe(false);
  });

  it("keeps palette storage ids out of the JSON column", () => {
    const colors = [
      { hex: "#ffffff", rgb: { r: 255, g: 255, b: 255 }, prevalence: 1 },
    ];
    expect(
      paletteGeneratorConfig.safeParse({ source: "discord", colors }).success,
    ).toBe(true);
    expect(
      paletteGeneratorConfig.safeParse({
        source: "discord",
        colors,
        imageStorageId: "kg2",
      }).success,
    ).toBe(false);
    expect(
      paletteGeneratorConfig.safeParse({
        v: 1,
        paletteSize: 5,
        displayFormat: "hex",
        collection: [],
      }).success,
    ).toBe(true);
  });

  it("checks user variant settings against their tool", () => {
    expect(
      userVariantSettingsByTool.dash.safeParse({ v: 1, widgets: ["wheel"] })
        .success,
    ).toBe(true);
    expect(
      userVariantSettingsByTool.dash.safeParse({ widgets: "wheel" }).success,
    ).toBe(false);
  });

  it("validates stream payloads", () => {
    expect(
      streamParams.safeParse({ ...params, _votesOpen: true, _finalName: null })
        .success,
    ).toBe(true);
    expect(
      streamVoteOptionMeta.safeParse({
        participantId: "p",
        participantName: "Ann",
      }).success,
    ).toBe(true);
    expect(
      streamVoteOptionMeta.safeParse({ streamer: true, via: "dice" }).success,
    ).toBe(false);
    expect(
      catStreamCommand.safeParse({ type: "spin", seq: 3, params, timestamp: 1 })
        .success,
    ).toBe(true);
    expect(
      catStreamCommand.safeParse({ type: "dance", seq: 3, timestamp: 1 })
        .success,
    ).toBe(false);
    expect(
      catStreamSettings.safeParse({
        v: 2,
        mode: "calm",
        lobbyCatCount: 6,
        autoClearSeconds: 9,
      }).success,
    ).toBe(true);
  });

  it("validates adoption settings and ancestry trees", () => {
    expect(
      adoptionBatchSettingsShape.safeParse({
        source: "evolution-generator",
        starter: { type: "history", slug: "abc", profileId: "j57x" },
      }).success,
    ).toBe(true);
    const genetics = {
      pelt: { allele1: "Tabby", allele2: "Tabby", expressed: "Tabby" },
      colour: { allele1: "GINGER", allele2: "GINGER", expressed: "GINGER" },
      eyeColour: { allele1: "YELLOW", allele2: "YELLOW", expressed: "YELLOW" },
      skinColour: { allele1: "PINK", allele2: "PINK", expressed: "PINK" },
      whitePatches: { allele1: null, allele2: null, expressed: null },
      isTortie: { allele1: false, allele2: false, expressed: false },
    };
    const cat = {
      id: "c1",
      name: { prefix: "Fire", suffix: "heart", full: "Fireheart" },
      gender: "M",
      lifeStage: "adult",
      params,
      motherId: null,
      fatherId: null,
      partnerIds: [],
      childrenIds: [],
      genetics,
      source: "founder",
      generation: 0,
    };
    expect(ancestryCats.safeParse([cat]).success).toBe(true);
    expect(ancestryCats.safeParse([{ ...cat, gender: "X" }]).success).toBe(
      false,
    );
  });
});
