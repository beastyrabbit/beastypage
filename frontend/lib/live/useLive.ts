"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveSnapshot<TData> {
  revision: number;
  data: TData;
}

export interface LiveEventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener?: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => void;
  close(): void;
}

export type LiveEventSourceFactory = (url: string) => LiveEventSourceLike;

export interface UseLiveOptions {
  enabled?: boolean;
  eventSource?: LiveEventSourceFactory;
}

function eventSourceUrl(topic: string): string {
  return `/api/live/${topic
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function parseSnapshot<TData>(data: string): LiveSnapshot<TData> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { revision?: unknown; data?: unknown };
    if (
      typeof record.revision !== "number" ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      !("data" in record)
    ) {
      return null;
    }
    return { revision: record.revision, data: record.data as TData };
  } catch {
    return null;
  }
}

/**
 * Returns the latest authorized live snapshot. EventSource handles transport
 * reconnects and sends Last-Event-ID; this hook additionally rejects stale and
 * duplicate revisions so a reconnect cannot move state backwards.
 */
export function useLiveSnapshot<TData>(
  topic: string | null | undefined,
  options: UseLiveOptions = {},
): LiveSnapshot<TData> | undefined {
  const [snapshot, setSnapshot] = useState<LiveSnapshot<TData> | undefined>();
  const revisionRef = useRef(-1);
  const factory = options.eventSource;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    revisionRef.current = -1;
    setSnapshot(undefined);
    if (!enabled || !topic) return;

    const createEventSource: LiveEventSourceFactory =
      factory ?? ((url) => new EventSource(url));
    const source = createEventSource(eventSourceUrl(topic));
    const handleMessage = (event: MessageEvent<string>) => {
      const next = parseSnapshot<TData>(event.data);
      if (!next || next.revision <= revisionRef.current) return;
      revisionRef.current = next.revision;
      setSnapshot(next);
    };
    source.onmessage = handleMessage;
    source.addEventListener?.("snapshot", handleMessage);
    // Native EventSource reconnects on its own. Keeping the object open on an
    // error preserves that behavior and lets it send Last-Event-ID.
    source.onerror = () => undefined;

    return () => {
      source.removeEventListener?.("snapshot", handleMessage);
      source.onmessage = null;
      source.onerror = null;
      source.close();
    };
  }, [enabled, factory, topic]);

  return snapshot;
}

/** Drop-in data-only form for a live aggregate query. */
export function useLive<TData>(
  topic: string | null | undefined,
  options: UseLiveOptions = {},
): TData | undefined {
  return useLiveSnapshot<TData>(topic, options)?.data;
}

/** Naming used by data-layer adapters that mirror a query hook. */
export const useLiveQuery = useLive;

export { eventSourceUrl, parseSnapshot };
