"use client";

import { useAuth } from "@clerk/nextjs";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Clock3,
  Copy,
  FileUp,
  Link2,
  LoaderCircle,
  RefreshCw,
  Share2,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  imageFromPaste,
  imageFromPastedMarkup,
  imageUrlFromPaste,
  imageUrlFromPastedMarkup,
  readClipboardMedia,
} from "@/lib/quick-share-clipboard";
import { cn } from "@/lib/utils";

type Policy = {
  maxBytes: number;
  hourlyStarts: number;
  dailyBytes: number;
  active: number;
  smallCutoffBytes: number;
  smallLifetimeMs: number;
  largeLifetimeMs: number;
  chunkBytes: number;
};

type ShareStatus = {
  id: string;
  slug: string;
  source: "file" | "url";
  originalName: string;
  originalSize: number;
  publicMime: string | null;
  state:
    | "uploading"
    | "processing"
    | "ready"
    | "unsupported"
    | "failed"
    | "removed";
  publicExpiresAt: number;
  retainedUntil: number;
  extendedAt: number | null;
  failureMessage: string | null;
  compatibilityWarning: string | null;
  url: string;
  parts?: Array<{ partNumber: number; etag: string; size: number }>;
};

type Receipt = {
  uploadId: string;
  receipt: string;
  slug: string;
  url: string;
  name: string;
  size: number;
  createdAt: number;
  publicExpiresAt: number;
};

type ActiveUpload = Receipt & {
  chunkBytes: number;
};

type WorkState =
  | { kind: "idle" }
  | { kind: "preparing"; label: string }
  | { kind: "uploading"; progress: number; label: string }
  | { kind: "processing"; label: string }
  | { kind: "done"; label: string }
  | { kind: "error"; label: string };

const RECEIPTS_KEY = "beastyrabbit.quick-share.receipts.v1";
const MIB = 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * MIB) return `${(bytes / (1024 * MIB)).toFixed(1)} GiB`;
  if (bytes >= MIB)
    return `${(bytes / MIB).toFixed(bytes < 10 * MIB ? 1 : 0)} MiB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${bytes} B`;
}

function formatExpiry(timestamp: number) {
  const remaining = timestamp - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `Expires in ${days} days`;
}

function readReceipts(): Receipt[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECEIPTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function writeReceipt(receipt: Receipt) {
  const next = [
    receipt,
    ...readReceipts().filter((item) => item.uploadId !== receipt.uploadId),
  ].slice(0, 10);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next));
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Something went wrong";
  if (raw.includes("ACTIVE_LIMIT")) {
    return "Too many shares are active. Wait for one to expire before creating another.";
  }
  if (raw.includes("HOURLY_LIMIT")) {
    return "The hourly share limit has been reached. Try again later.";
  }
  if (raw.includes("DAILY_BYTES_LIMIT")) {
    return "The daily transfer limit has been reached. Try again tomorrow.";
  }
  if (raw.includes("IP_BANNED"))
    return "Sharing is unavailable from this network.";
  return raw.replace(/^Error:\s*/i, "");
}

function shareUrl(slug: string, fallback: string) {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    return `${window.location.origin}/i/${slug}`;
  }
  return fallback;
}

function normalizeShare<T extends ShareStatus>(item: T): T {
  return { ...item, url: shareUrl(item.slug, item.url) };
}

export function QuickShareClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clipboardPasteRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"file" | "url" | "clipboard">("file");
  const [file, setFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState<"file" | "clipboard" | null>(
    null,
  );
  const [remoteUrl, setRemoteUrl] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [work, setWork] = useState<WorkState>({ kind: "idle" });
  const [current, setCurrent] = useState<ShareStatus | null>(null);
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null);
  const [history, setHistory] = useState<ShareStatus[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [now, setNow] = useState(0);

  const selectFile = useCallback(
    (nextFile: File | null, source: "file" | "clipboard") => {
      setFile(nextFile);
      setFileSource(nextFile ? source : null);
      setActiveUpload(null);
      setCurrent(null);
      setWork({ kind: "idle" });
    },
    [],
  );

  const apiFetch = useCallback(
    async <T,>(
      path: string,
      init: RequestInit = {},
      uploadReceipt?: string,
    ): Promise<T> => {
      const token = isSignedIn ? await getToken({ template: "convex" }) : null;
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (uploadReceipt) headers.set("x-upload-receipt", uploadReceipt);
      if (init.body && !(init.body instanceof Blob)) {
        headers.set("content-type", "application/json");
      }
      const response = await fetch(path, { ...init, headers });
      const body = (await response.json().catch(() => null)) as
        | T
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : `Request failed (${response.status})`,
        );
      }
      return body as T;
    },
    [getToken, isSignedIn],
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      if (isLoaded && isSignedIn) {
        const uploads = await apiFetch<ShareStatus[]>("/i/api/account/uploads");
        setHistory(uploads.map(normalizeShare));
      } else {
        const receipts = readReceipts();
        const uploads = await Promise.all(
          receipts.map((item) =>
            apiFetch<ShareStatus>(
              `/i/api/uploads/${item.uploadId}/status`,
              {},
              item.receipt,
            ).catch(() => null),
          ),
        );
        setHistory(
          uploads
            .filter((item): item is ShareStatus => item !== null)
            .map(normalizeShare),
        );
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [apiFetch, isLoaded, isSignedIn]);

  useEffect(() => {
    void apiFetch<Policy>("/i/api/policy")
      .then(setPolicy)
      .catch((error) => setWork({ kind: "error", label: errorMessage(error) }));
    void loadHistory();
  }, [apiFetch, loadHistory]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const remember = useCallback(
    (created: ActiveUpload) => {
      setActiveUpload(created);
      if (!isSignedIn) {
        writeReceipt({
          uploadId: created.uploadId,
          receipt: created.receipt,
          slug: created.slug,
          url: created.url,
          name: created.name,
          size: created.size,
          createdAt: created.createdAt,
          publicExpiresAt: created.publicExpiresAt,
        });
      }
    },
    [isSignedIn],
  );

  const waitForProcessing = useCallback(
    async (upload: ActiveUpload) => {
      setWork({ kind: "processing", label: "Preparing a chat-friendly file…" });
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const status = await apiFetch<ShareStatus>(
          `/i/api/uploads/${upload.uploadId}/status`,
          {},
          upload.receipt,
        );
        setCurrent(normalizeShare(status));
        if (status.state === "ready") {
          setWork({ kind: "done", label: "Your link is ready." });
          await loadHistory();
          return;
        }
        if (
          status.state === "unsupported" ||
          status.state === "failed" ||
          status.state === "removed"
        ) {
          throw new Error(
            status.failureMessage ??
              "This file could not be made available for sharing.",
          );
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      throw new Error(
        "Processing is taking longer than expected. Check Recent shares later.",
      );
    },
    [apiFetch, loadHistory],
  );

  const uploadParts = useCallback(
    async (selectedFile: File, upload: ActiveUpload) => {
      const status = await apiFetch<ShareStatus>(
        `/i/api/uploads/${upload.uploadId}/status`,
        {},
        upload.receipt,
      );
      const completeParts = new Set(
        status.parts?.map((part) => part.partNumber) ?? [],
      );
      const count = Math.ceil(selectedFile.size / upload.chunkBytes);
      let completedBytes =
        status.parts?.reduce((sum, part) => sum + part.size, 0) ?? 0;

      for (let index = 0; index < count; index += 1) {
        const partNumber = index + 1;
        if (completeParts.has(partNumber)) continue;
        const start = index * upload.chunkBytes;
        const chunk = selectedFile.slice(
          start,
          Math.min(selectedFile.size, start + upload.chunkBytes),
        );
        let lastError: unknown;
        for (let retry = 0; retry < 3; retry += 1) {
          try {
            await apiFetch(
              `/i/api/uploads/${upload.uploadId}/parts/${partNumber}`,
              { method: "PUT", body: chunk },
              upload.receipt,
            );
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (retry < 2) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, 750 * (retry + 1)),
              );
            }
          }
        }
        if (lastError) throw lastError;
        completedBytes += chunk.size;
        setWork({
          kind: "uploading",
          progress: Math.round((completedBytes / selectedFile.size) * 100),
          label: `Sending ${formatBytes(completedBytes)} of ${formatBytes(
            selectedFile.size,
          )}`,
        });
      }

      await apiFetch<ShareStatus>(
        `/i/api/uploads/${upload.uploadId}/complete`,
        { method: "POST", body: JSON.stringify({}) },
        upload.receipt,
      );
      await waitForProcessing(upload);
    },
    [apiFetch, waitForProcessing],
  );

  async function startFileUpload(event: FormEvent, selectedFile: File | null) {
    event.preventDefault();
    if (!selectedFile || !policy) return;
    if (selectedFile.size > policy.maxBytes) {
      setWork({
        kind: "error",
        label: `This file is larger than the current ${formatBytes(
          policy.maxBytes,
        )} limit.`,
      });
      return;
    }
    setCurrent(null);
    setWork({ kind: "preparing", label: "Starting your share…" });
    try {
      const created = await apiFetch<{
        uploadId: string;
        slug: string;
        receipt: string;
        url: string;
        publicExpiresAt: number;
        chunkBytes: number;
      }>("/i/api/uploads", {
        method: "POST",
        body: JSON.stringify({
          name: selectedFile.name,
          mime: selectedFile.type || undefined,
          size: selectedFile.size,
        }),
      });
      const upload: ActiveUpload = {
        ...created,
        url: shareUrl(created.slug, created.url),
        name: selectedFile.name,
        size: selectedFile.size,
        createdAt: Date.now(),
      };
      remember(upload);
      await uploadParts(selectedFile, upload);
    } catch (error) {
      setWork({ kind: "error", label: errorMessage(error) });
    }
  }

  async function retryCurrent() {
    if (!file || !activeUpload || file.size !== activeUpload.size) return;
    setWork({ kind: "preparing", label: "Checking received parts…" });
    try {
      await uploadParts(file, activeUpload);
    } catch (error) {
      setWork({ kind: "error", label: errorMessage(error) });
    }
  }

  async function startImport(event: FormEvent) {
    event.preventDefault();
    if (!remoteUrl.trim()) return;
    setCurrent(null);
    setWork({
      kind: "preparing",
      label: "Fetching the original from that link…",
    });
    try {
      const result = await apiFetch<ShareStatus & { receipt: string }>(
        "/i/api/imports",
        {
          method: "POST",
          body: JSON.stringify({ url: remoteUrl.trim() }),
        },
      );
      const upload: ActiveUpload = {
        uploadId: result.id,
        receipt: result.receipt,
        slug: result.slug,
        url: shareUrl(result.slug, result.url),
        name: result.originalName,
        size: result.originalSize,
        createdAt: Date.now(),
        publicExpiresAt: result.publicExpiresAt,
        chunkBytes: policy?.chunkBytes ?? 16 * MIB,
      };
      remember(upload);
      setCurrent(normalizeShare(result));
      await waitForProcessing(upload);
    } catch (error) {
      setWork({ kind: "error", label: errorMessage(error) });
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function shareLink(item: ShareStatus) {
    if (navigator.share) {
      await navigator.share({ title: item.originalName, url: item.url });
    } else {
      await copyLink(item.url);
    }
  }

  async function extend(item: ShareStatus) {
    try {
      const updated = await apiFetch<ShareStatus>(
        `/i/api/account/uploads/${item.id}/extend`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const normalized = normalizeShare(updated);
      setHistory((items) =>
        items.map((existing) =>
          existing.id === normalized.id ? normalized : existing,
        ),
      );
      if (current?.id === normalized.id) setCurrent(normalized);
      toast.success("Share extended to 30 days");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const busy =
    work.kind === "preparing" ||
    work.kind === "uploading" ||
    work.kind === "processing";
  const deviceFile = fileSource === "file" ? file : null;
  const pastedFile = fileSource === "clipboard" ? file : null;

  const acceptClipboardUrl = useCallback(
    (url: string) => {
      selectFile(null, "clipboard");
      setRemoteUrl(url);
      setMode("url");
      toast.success("Image link recovered from clipboard");
    },
    [selectFile],
  );

  const acceptPastedContent = useCallback(
    (clipboardData: DataTransfer) => {
      const pasted = imageFromPaste(clipboardData);
      if (pasted) {
        selectFile(pasted, "clipboard");
        return true;
      }
      const url = imageUrlFromPaste(clipboardData);
      if (url) {
        acceptClipboardUrl(url);
        return true;
      }
      return false;
    },
    [acceptClipboardUrl, selectFile],
  );

  const acceptPastedMarkup = useCallback(async () => {
    const target = clipboardPasteRef.current;
    if (!target) return;
    try {
      const url = imageUrlFromPastedMarkup(target);
      if (url) {
        target.replaceChildren();
        acceptClipboardUrl(url);
        return;
      }
      const pasted = await imageFromPastedMarkup(target);
      target.replaceChildren();
      if (pasted) {
        selectFile(pasted, "clipboard");
        return;
      }
      setWork({
        kind: "error",
        label: "Safari did not provide image data for that paste.",
      });
    } catch {
      target.replaceChildren();
      setWork({
        kind: "error",
        label: "Safari could not read the pasted image.",
      });
    }
  }, [acceptClipboardUrl, selectFile]);

  useEffect(() => {
    if (mode !== "clipboard" || busy) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      if (acceptPastedContent(event.clipboardData)) {
        event.preventDefault();
        return;
      }

      const target = clipboardPasteRef.current;
      if (target?.contains(event.target as Node)) {
        // WebKit exposes some iOS images only by inserting an <img> with a
        // temporary blob URL into a rich editable target. Let that default
        // paste happen, then extract the blob in the input event.
        return;
      }

      event.preventDefault();
      target?.focus();
      setWork({
        kind: "error",
        label:
          "Safari did not expose the image directly. Tap and hold the paste area, then choose Paste.",
      });
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [acceptPastedContent, busy, mode]);

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) {
      clipboardPasteRef.current?.focus();
      setWork({
        kind: "error",
        label:
          "Direct clipboard access is unavailable here. Tap the paste area and use your browser’s Paste command.",
      });
      return;
    }
    try {
      const media = await readClipboardMedia(navigator.clipboard);
      if (!media) {
        clipboardPasteRef.current?.focus();
        setWork({
          kind: "error",
          label:
            "Safari did not expose the image directly. Tap and hold the paste area, then choose Paste.",
        });
        return;
      }
      if (media.kind === "url") {
        acceptClipboardUrl(media.url);
        return;
      }
      selectFile(media.file, "clipboard");
    } catch {
      clipboardPasteRef.current?.focus();
      setWork({
        kind: "error",
        label:
          "Clipboard access was blocked. Tap the paste area and use your browser’s Paste command.",
      });
    }
  }

  const currentLimit = useMemo(
    () =>
      policy
        ? `${formatBytes(policy.maxBytes)} per file · ${policy.hourlyStarts} starts/hour · ${policy.active} active`
        : "Loading current limits…",
    [policy],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Quick Share
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Pick or paste a photo or video and get a short link that opens it
          directly.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{currentLimit}</p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-xl border border-border/70 bg-background/70">
          <div className="flex border-b border-border/70" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "file"}
              className={cn(
                "flex-1 border-b-2 px-2 py-3 text-xs font-medium transition sm:px-4 sm:text-sm",
                mode === "file"
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("file")}
            >
              Photo/video
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "url"}
              className={cn(
                "flex-1 border-b-2 px-2 py-3 text-xs font-medium transition sm:px-4 sm:text-sm",
                mode === "url"
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("url")}
            >
              From a link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "clipboard"}
              className={cn(
                "flex-1 border-b-2 px-2 py-3 text-xs font-medium transition sm:px-4 sm:text-sm",
                mode === "clipboard"
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("clipboard")}
            >
              Clipboard
            </button>
          </div>

          <div className="p-4 sm:p-6">
            {mode === "file" ? (
              <form
                onSubmit={(event) => startFileUpload(event, deviceFile)}
                className="space-y-5"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.heic,.heif,.avif,.tif,.tiff,.mkv,.avi"
                  className="sr-only"
                  onChange={(event) => {
                    selectFile(event.target.files?.[0] ?? null, "file");
                  }}
                />
                <button
                  type="button"
                  className="flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-8 text-center transition hover:border-amber-500/60 hover:bg-amber-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mb-4 size-7 text-amber-400" />
                  <span className="font-medium">
                    {deviceFile ? deviceFile.name : "Choose photo or video"}
                  </span>
                  <span className="mt-2 text-xs text-muted-foreground">
                    {deviceFile
                      ? `${formatBytes(deviceFile.size)} · tap to choose another`
                      : "Camera, photo library, or files"}
                  </span>
                </button>
                <button
                  type="submit"
                  disabled={!deviceFile || !policy || busy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Create link
                </button>
              </form>
            ) : mode === "url" ? (
              <form onSubmit={startImport} className="space-y-5">
                <label
                  className="block text-sm font-medium"
                  htmlFor="media-url"
                >
                  Media link
                </label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-3 size-5 text-muted-foreground" />
                  <input
                    id="media-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={remoteUrl}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                    placeholder="https://…"
                    className="min-h-11 w-full rounded-lg border border-border bg-background py-2.5 pl-11 pr-3 text-base outline-none transition placeholder:text-muted-foreground/60 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  The link must point to a publicly reachable photo or video.
                </p>
                <button
                  type="submit"
                  disabled={!remoteUrl.trim() || !policy || busy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Create link
                </button>
              </form>
            ) : (
              <form
                onSubmit={(event) => startFileUpload(event, pastedFile)}
                className="space-y-5"
              >
                <div className="relative min-h-44 overflow-hidden rounded-lg border border-dashed border-border transition focus-within:border-amber-500 focus-within:bg-amber-500/5 focus-within:ring-2 focus-within:ring-amber-500">
                  {/* WebKit requires a rich editable target to expose some iOS image pastes. */}
                  {/* biome-ignore lint/a11y/useSemanticElements: an input or textarea cannot receive WebKit's pasted image markup */}
                  <div
                    ref={clipboardPasteRef}
                    contentEditable={!busy}
                    suppressContentEditableWarning
                    inputMode="none"
                    role="textbox"
                    tabIndex={0}
                    aria-label="Paste an image from the clipboard"
                    className="absolute inset-0 z-10 size-full cursor-text overflow-hidden bg-transparent text-transparent caret-transparent outline-none [&_img]:opacity-0"
                    onInput={() => void acceptPastedMarkup()}
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 py-8 text-center">
                    <ClipboardPaste className="mb-4 size-7 text-amber-400" />
                    <span className="font-medium">
                      {pastedFile ? pastedFile.name : "Paste an image here"}
                    </span>
                    <span className="mt-2 text-xs text-muted-foreground">
                      {pastedFile
                        ? `${formatBytes(pastedFile.size)} · paste again to replace`
                        : "Tap and choose Paste, or press Ctrl/⌘+V"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-amber-500/50 hover:bg-amber-500/5 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void pasteFromClipboard()}
                >
                  <ClipboardPaste className="size-4" />
                  {pastedFile ? "Replace from clipboard" : "Read clipboard"}
                </button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Clipboard access depends on your browser. The paste area works
                  when direct access is unavailable.
                </p>
                <button
                  type="submit"
                  disabled={!pastedFile || !policy || busy}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Create link
                </button>
              </form>
            )}

            {work.kind !== "idle" ? (
              <div
                className={cn(
                  "mt-5 rounded-lg border px-4 py-3 text-sm",
                  work.kind === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : work.kind === "done"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      : "border-border bg-muted/40 text-foreground",
                )}
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  {work.kind === "error" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  ) : work.kind === "done" ? (
                    <Check className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p>{work.label}</p>
                    {work.kind === "uploading" ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-background">
                        <div
                          className="h-full bg-amber-500 transition-[width]"
                          style={{ width: `${work.progress}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                {work.kind === "error" &&
                file &&
                activeUpload &&
                file.size === activeUpload.size ? (
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold hover:bg-red-500/10"
                    onClick={() => void retryCurrent()}
                  >
                    <RefreshCw className="size-3.5" />
                    Resume
                  </button>
                ) : null}
              </div>
            ) : null}

            {current?.state === "ready" && current.publicExpiresAt > now ? (
              <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                {current.publicMime?.startsWith("video/") ? (
                  // biome-ignore lint/a11y/useMediaCaption: arbitrary user-supplied media has no caption track available
                  <video
                    src={current.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="mb-4 max-h-80 w-full rounded-md bg-black object-contain"
                  />
                ) : (
                  // The URL intentionally points directly to user media.
                  // biome-ignore lint/performance/noImgElement: raw media URLs have unknown dimensions and must not be transformed
                  <img
                    src={current.url}
                    alt=""
                    className="mb-4 max-h-80 w-full rounded-md bg-black/30 object-contain"
                  />
                )}
                <p className="truncate font-mono text-sm">{current.url}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatExpiry(current.publicExpiresAt)}
                </p>
                {current.compatibilityWarning ? (
                  <p className="mt-2 text-xs text-amber-200">
                    {current.compatibilityWarning}
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-sm font-semibold text-background"
                    onClick={() => void copyLink(current.url)}
                  >
                    <Copy className="size-4" /> Copy link
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"
                    onClick={() => void shareLink(current)}
                  >
                    <Share2 className="size-4" /> Share
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/70 bg-muted/20 px-4 py-4 text-xs leading-5 text-muted-foreground sm:px-6">
            Shares cannot be deleted by the uploader. They expire automatically.
            A private original is retained for moderation for up to 30 days.
          </div>
        </section>

        <aside>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent shares</h2>
            <button
              type="button"
              className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Refresh recent shares"
              onClick={() => void loadHistory()}
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
          {historyLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 px-4 py-5 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Your active and recent shares will appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <p className="truncate text-sm font-medium">
                    {item.originalName}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    <span>{formatExpiry(item.publicExpiresAt)}</span>
                    <span aria-hidden>·</span>
                    <span>{formatBytes(item.originalSize)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={
                        item.state !== "ready" || item.publicExpiresAt <= now
                      }
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-2 text-xs font-semibold text-background disabled:opacity-40"
                      onClick={() => void copyLink(item.url)}
                    >
                      <Copy className="size-3.5" /> Copy
                    </button>
                    <button
                      type="button"
                      disabled={
                        item.state !== "ready" || item.publicExpiresAt <= now
                      }
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-semibold disabled:opacity-40"
                      onClick={() => void shareLink(item)}
                    >
                      <Share2 className="size-3.5" /> Share
                    </button>
                  </div>
                  {isSignedIn &&
                  policy &&
                  item.originalSize > policy.smallCutoffBytes &&
                  !item.extendedAt &&
                  item.state === "ready" &&
                  item.publicExpiresAt > now ? (
                    <button
                      type="button"
                      className="mt-2 min-h-9 w-full rounded-md border border-amber-500/30 px-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
                      onClick={() => void extend(item)}
                    >
                      Extend to 30 days
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            There is no uploader delete button. Moderators can remove abusive
            media early.
          </p>
        </aside>
      </div>
    </main>
  );
}
