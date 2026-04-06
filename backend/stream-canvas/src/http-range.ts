export type ByteRangeParseResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "range"; start: number; end: number; length: number };

function parseStrictNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue)) {
    return null;
  }

  return parsedValue;
}

export function parseSingleByteRange(
  rangeHeader: string | undefined,
  fileSize: number,
): ByteRangeParseResult {
  if (!rangeHeader) {
    return { kind: "none" };
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { kind: "invalid" };
  }

  if (!rangeHeader.startsWith("bytes=")) {
    return { kind: "invalid" };
  }

  const [rawRange] = rangeHeader.slice("bytes=".length).split(",", 1);
  if (!rawRange) {
    return { kind: "invalid" };
  }

  const [rawStart, rawEnd] = rawRange.split("-", 2);
  const startPart = rawStart?.trim() ?? "";
  const endPart = rawEnd?.trim() ?? "";

  if (!startPart && !endPart) {
    return { kind: "invalid" };
  }

  let start = 0;
  let end = fileSize - 1;

  if (!startPart) {
    const suffixLength = parseStrictNonNegativeInteger(endPart);
    if (suffixLength === null || suffixLength <= 0) {
      return { kind: "invalid" };
    }

    start = Math.max(0, fileSize - suffixLength);
  } else {
    const parsedStart = parseStrictNonNegativeInteger(startPart);
    if (parsedStart === null) {
      return { kind: "invalid" };
    }
    start = parsedStart;

    if (endPart) {
      const parsedEnd = parseStrictNonNegativeInteger(endPart);
      if (parsedEnd === null) {
        return { kind: "invalid" };
      }
      end = parsedEnd;
    }
  }

  end = Math.min(end, fileSize - 1);

  if (start >= fileSize || end < start) {
    return { kind: "invalid" };
  }

  return {
    kind: "range",
    start,
    end,
    length: end - start + 1,
  };
}
