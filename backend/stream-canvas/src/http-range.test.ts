import assert from "node:assert/strict";
import test from "node:test";
import { parseSingleByteRange } from "./http-range.ts";

test("parseSingleByteRange returns none when no range header is present", () => {
  assert.deepEqual(parseSingleByteRange(undefined, 1024), { kind: "none" });
});

test("parseSingleByteRange parses explicit byte ranges", () => {
  assert.deepEqual(parseSingleByteRange("bytes=100-199", 1000), {
    kind: "range",
    start: 100,
    end: 199,
    length: 100,
  });
});

test("parseSingleByteRange parses open-ended ranges", () => {
  assert.deepEqual(parseSingleByteRange("bytes=900-", 1000), {
    kind: "range",
    start: 900,
    end: 999,
    length: 100,
  });
});

test("parseSingleByteRange parses suffix ranges", () => {
  assert.deepEqual(parseSingleByteRange("bytes=-250", 1000), {
    kind: "range",
    start: 750,
    end: 999,
    length: 250,
  });
});

test("parseSingleByteRange rejects malformed or out-of-bounds ranges", () => {
  assert.deepEqual(parseSingleByteRange("items=0-10", 1000), { kind: "invalid" });
  assert.deepEqual(parseSingleByteRange("bytes=100abc-200", 1000), {
    kind: "invalid",
  });
  assert.deepEqual(parseSingleByteRange("bytes=1000-1200", 1000), { kind: "invalid" });
  assert.deepEqual(parseSingleByteRange("bytes=500-100", 1000), { kind: "invalid" });
});
