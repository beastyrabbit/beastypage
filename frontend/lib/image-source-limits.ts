/**
 * Validate raster image dimensions before handing compressed bytes to an
 * image decoder. Header dimensions are cheap to read, while decoding a
 * decompression bomb can allocate hundreds of megabytes first.
 */

export const MAX_SOURCE_DIMENSION = 16_384;
export const MAX_SOURCE_PIXELS = 25_000_000;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type ImageDimensions = { width: number; height: number };

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readGifDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 10 ||
    (buffer.toString("ascii", 0, 6) !== "GIF87a" &&
      buffer.toString("ascii", 0, 6) !== "GIF89a")
  ) {
    return null;
  }
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  // WebP stores the dimensions in one of the three image chunks. Walk the
  // chunk table so optional metadata chunks before the image are supported.
  const byteAt = (index: number) => buffer[index] ?? 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset > buffer.length || chunkSize > buffer.length - dataOffset) {
      return null;
    }

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width:
          1 +
          byteAt(dataOffset + 4) +
          (byteAt(dataOffset + 5) << 8) +
          (byteAt(dataOffset + 6) << 16),
        height:
          1 +
          byteAt(dataOffset + 7) +
          (byteAt(dataOffset + 8) << 8) +
          (byteAt(dataOffset + 9) << 16),
      };
    }

    if (chunkType === "VP8 " && chunkSize >= 10) {
      const frameOffset = dataOffset + 3;
      if (
        buffer[frameOffset] === 0x9d &&
        buffer[frameOffset + 1] === 0x01 &&
        buffer[frameOffset + 2] === 0x2a
      ) {
        return {
          width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
          height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        };
      }
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
    }

    // Chunks are padded to an even byte boundary.
    offset = dataOffset + chunkSize + (chunkSize & 1);
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  // Header parsing is bounded by the already materialized input buffer. This
  // handles valid JPEGs with large metadata segments without decoding them.
  const scanLimit = buffer.length;
  let offset = 2;
  while (offset + 3 < scanLimit) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < scanLimit && buffer[offset] === 0xff) offset += 1;
    if (offset >= scanLimit) return null;
    const marker = buffer[offset] ?? 0;
    offset += 1;

    if (
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0xd8 ||
      marker === 0xd9
    )
      continue;
    if (marker === 0xda) return null;
    if (offset + 2 > scanLimit) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > scanLimit) return null;

    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function readImageDimensions(buffer: Buffer): ImageDimensions {
  const png = readPngDimensions(buffer);
  if (png) return png;
  const gif = readGifDimensions(buffer);
  if (gif) return gif;
  const webp = readWebpDimensions(buffer);
  if (webp) return webp;
  const isJpeg = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  const jpeg = readJpegDimensions(buffer);
  if (jpeg) return jpeg;
  if (isJpeg) throw new Error("Unable to read JPEG dimensions");
  throw new Error("Unsupported or unreadable raster image header");
}

export function assertImageSourceWithinLimits(buffer: Buffer): ImageDimensions {
  const dimensions = readImageDimensions(buffer);
  const { width, height } = dimensions;
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_SOURCE_DIMENSION ||
    height > MAX_SOURCE_DIMENSION ||
    (width <= MAX_SOURCE_DIMENSION &&
      height <= MAX_SOURCE_DIMENSION &&
      width * height > MAX_SOURCE_PIXELS)
  ) {
    throw new Error(
      `Image dimensions exceed processing limits (maximum ${MAX_SOURCE_DIMENSION}px per side and ${MAX_SOURCE_PIXELS.toLocaleString()} pixels)`,
    );
  }
  return dimensions;
}
