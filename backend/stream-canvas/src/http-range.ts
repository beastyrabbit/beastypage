export type ByteRangeParseResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "range"; start: number; end: number; length: number };

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
    const suffixLength = Number.parseInt(endPart, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { kind: "invalid" };
    }

    start = Math.max(0, fileSize - suffixLength);
  } else {
    start = Number.parseInt(startPart, 10);
    if (!Number.isFinite(start) || start < 0) {
      return { kind: "invalid" };
    }

    if (endPart) {
      end = Number.parseInt(endPart, 10);
      if (!Number.isFinite(end) || end < 0) {
        return { kind: "invalid" };
      }
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
