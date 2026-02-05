import type { ProcessRequest, ProcessResponse, DetectGridResponse, ProcessMode } from "./types";
import type { Pipeline } from "./types";

export async function processImage(
  image: string,
  pipeline: Pipeline,
  mode: ProcessMode,
  outputFormat: "png" | "jpeg" | "webp" = "png",
  outputQuality = 90,
): Promise<ProcessResponse> {
  const body: ProcessRequest = {
    image,
    pipeline,
    mode,
    outputFormat,
    outputQuality,
  };

  const res = await fetch("/api/pixelator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? `Processing failed (${res.status})`);
  }

  return res.json() as Promise<ProcessResponse>;
}

export async function detectGrid(image: string): Promise<DetectGridResponse> {
  const res = await fetch("/api/pixelator/detect-grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? `Detection failed (${res.status})`);
  }

  return res.json() as Promise<DetectGridResponse>;
}
