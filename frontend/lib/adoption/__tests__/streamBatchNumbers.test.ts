import { describe, expect, it } from "vitest";
import {
  batchCatNumber,
  formatBatchNumber,
  parseBatchNumberInput,
} from "../streamBatch";

const cats = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("batch show numbers", () => {
  it("numbers cats by pool position, starting at 1", () => {
    expect(batchCatNumber(cats, "a")).toBe(1);
    expect(batchCatNumber(cats, "c")).toBe(3);
    expect(batchCatNumber(cats, "missing")).toBe(0);
  });

  it("formats two digits", () => {
    expect(formatBatchNumber(7)).toBe("07");
    expect(formatBatchNumber(23)).toBe("23");
    expect(formatBatchNumber(0)).toBe("00");
  });

  it("parses the streamer's number input leniently", () => {
    expect(parseBatchNumberInput("13", 25)).toBe(13);
    expect(parseBatchNumberInput("#07", 25)).toBe(7);
    expect(parseBatchNumberInput("cat 22", 25)).toBe(22);
    expect(parseBatchNumberInput("", 25)).toBeNull();
    expect(parseBatchNumberInput("0", 25)).toBeNull();
    expect(parseBatchNumberInput("26", 25)).toBeNull();
    expect(parseBatchNumberInput("abc", 25)).toBeNull();
  });
});
