type ClipboardData = Pick<DataTransfer, "files" | "items"> &
  Partial<Pick<DataTransfer, "getData">>;

type ClipboardReaderItem = {
  types: readonly string[];
  getType(type: string): Promise<Blob>;
};

type ClipboardReader = {
  read(): Promise<ClipboardReaderItem[]>;
};

export type ClipboardMedia =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string };

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

function httpUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const url = new URL(
      candidate.startsWith("//") ? `https:${candidate}` : candidate,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function firstUriListUrl(value: string) {
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const url = httpUrl(line);
    if (url) return url;
  }
  return null;
}

function urlFromHtml(value: string) {
  if (!value.trim()) return null;
  const document = new DOMParser().parseFromString(value, "text/html");
  const candidates = [
    document.querySelector("img")?.getAttribute("src"),
    document.querySelector("a")?.getAttribute("href"),
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate ?? "");
    if (url) return url;
  }
  return null;
}

export function imageUrlFromPaste(data: ClipboardData) {
  if (!data.getData) return null;
  return (
    firstUriListUrl(data.getData("text/uri-list")) ??
    urlFromHtml(data.getData("text/html")) ??
    httpUrl(data.getData("text/plain"))
  );
}

export function imageUrlFromPastedMarkup(container: ParentNode) {
  const candidates = [
    container.querySelector("img")?.getAttribute("src"),
    container.querySelector("a")?.getAttribute("href"),
    container.textContent,
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate ?? "");
    if (url) return url;
  }
  return null;
}

export async function imageFromPastedMarkup(
  container: ParentNode,
  now = Date.now(),
) {
  const image = container.querySelector("img");
  const source = image?.getAttribute("src")?.trim() ?? "";
  if (!source.startsWith("blob:") && !source.startsWith("data:image/")) {
    return null;
  }

  const response = await fetch(source);
  if (!response.ok) return null;
  const blob = await response.blob();
  return clipboardImageFile(blob, blob.type || "image/png", now);
}

export async function readClipboardMedia(
  reader: ClipboardReader,
  now = Date.now(),
): Promise<ClipboardMedia | null> {
  const items = await reader.read();
  for (const item of items) {
    const mime = item.types.find((type) => type.startsWith("image/"));
    if (!mime) continue;
    const blob = await item.getType(mime);
    const file = clipboardImageFile(blob, mime, now);
    if (file) return { kind: "file", file };
  }

  const textTypes = ["text/uri-list", "text/html", "text/plain"] as const;
  for (const type of textTypes) {
    for (const item of items) {
      if (!item.types.includes(type)) continue;
      const value = await (await item.getType(type)).text();
      const url =
        type === "text/uri-list"
          ? firstUriListUrl(value)
          : type === "text/html"
            ? urlFromHtml(value)
            : httpUrl(value);
      if (url) return { kind: "url", url };
    }
  }
  return null;
}

export async function readClipboardImage(
  reader: ClipboardReader,
  now = Date.now(),
) {
  const media = await readClipboardMedia(reader, now);
  return media?.kind === "file" ? media.file : null;
}
