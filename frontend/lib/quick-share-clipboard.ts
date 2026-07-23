type ClipboardData = Pick<DataTransfer, "files" | "items">;

type ClipboardReaderItem = {
  types: readonly string[];
  getType(type: string): Promise<Blob>;
};

type ClipboardReader = {
  read(): Promise<ClipboardReaderItem[]>;
};

function extensionForMime(mime: string) {
  const known: Record<string, string> = {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/tiff": "tiff",
    "image/webp": "webp",
  };
  return known[mime] ?? "img";
}

function clipboardName(mime: string, now: number) {
  const timestamp = new Date(now)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "");
  return `clipboard-${timestamp}.${extensionForMime(mime)}`;
}

export function clipboardImageFile(
  blob: Blob,
  mime = blob.type,
  now = Date.now(),
) {
  if (!mime.startsWith("image/") || blob.size === 0) return null;
  return new File([blob], clipboardName(mime, now), {
    type: mime,
    lastModified: now,
  });
}

export function imageFromPaste(data: ClipboardData, now = Date.now()) {
  const pastedFile = Array.from(data.files).find((item) =>
    item.type.startsWith("image/"),
  );
  if (pastedFile) return clipboardImageFile(pastedFile, pastedFile.type, now);

  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return clipboardImageFile(file, item.type, now);
  }
  return null;
}

export async function readClipboardImage(
  reader: ClipboardReader,
  now = Date.now(),
) {
  const items = await reader.read();
  for (const item of items) {
    const mime = item.types.find((type) => type.startsWith("image/"));
    if (!mime) continue;
    const blob = await item.getType(mime);
    const file = clipboardImageFile(blob, mime, now);
    if (file) return file;
  }
  return null;
}
