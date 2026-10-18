import { type NextRequest, NextResponse } from "next/server";
import { ANONYMOUS, getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { isServiceError, ServiceError } from "@/server/errors";
import { errorResponse } from "@/server/http";
import { subscribeLive, waitForLiveReady } from "@/server/live/listener";
import { findLiveTopic } from "@/server/live/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 15 * 60_000;
const BACKPRESSURE_CLOSE_MS = 1_000;

function errorJson(error: ServiceError): NextResponse {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  );
}

function lastEventRevision(request: NextRequest): number | null {
  const value = request.headers.get("last-event-id");
  if (!value || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

function snapshotEvent(revision: number, data: unknown): string {
  return `id: ${revision}\nevent: snapshot\ndata: ${JSON.stringify({ revision, data })}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ topic: string[] }> },
) {
  const { topic: topicParts } = await params;
  const topic = topicParts.join("/");
  const definition = findLiveTopic(topic);
  if (!definition) {
    return NextResponse.json(
      { error: "Live topic not found", code: "not_found" },
      { status: 404 },
    );
  }

  const parsed = definition.parse(topic);
  if (parsed === null) {
    return NextResponse.json(
      { error: "Live topic not found", code: "not_found" },
      { status: 404 },
    );
  }

  // The test-only topic authenticates with its own query key and must remain
  // runnable without a Clerk session in the database test process.
  let identity:
    | Awaited<ReturnType<typeof getRequestIdentity>>
    | typeof ANONYMOUS;
  try {
    identity =
      definition.family === "test" ? ANONYMOUS : await getRequestIdentity();
  } catch (error) {
    return errorResponse(
      error,
      "Failed to authenticate live topic",
      "Live authentication failed",
    );
  }
  const context = { request, identity, db: getDb() };
  let authorization: unknown;
  try {
    authorization = await definition.authorize(parsed, context);
  } catch (error) {
    if (isServiceError(error)) return errorJson(error);
    return errorResponse(
      error,
      "Failed to authorize live topic",
      "Live authorization failed",
    );
  }
  if (authorization === null) {
    return errorJson(
      new ServiceError("forbidden", "Not authorized for live topic"),
    );
  }

  const initialRevision = lastEventRevision(request);
  const encoder = new TextEncoder();
  let closeStream: () => void = () => undefined;
  let pullRefresh: () => void = () => undefined;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let closed = false;
        let lastSentRevision = initialRevision ?? -1;
        let unsubscribe: (() => void) | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let expiry: ReturnType<typeof setTimeout> | undefined;
        let backpressureTimer: ReturnType<typeof setTimeout> | undefined;
        let refreshRunning = false;
        let refreshPending = false;

        const clearBackpressureTimer = () => {
          if (!backpressureTimer) return;
          clearTimeout(backpressureTimer);
          backpressureTimer = undefined;
        };

        const scheduleBackpressureClose = () => {
          backpressureTimer = setTimeout(() => {
            backpressureTimer = undefined;
            if (closed) return;
            if ((controller.desiredSize ?? 0) <= 0) {
              close();
            } else if (refreshPending) {
              refresh();
            }
          }, BACKPRESSURE_CLOSE_MS);
          backpressureTimer.unref?.();
        };

        const checkBackpressure = () => {
          if (closed) return false;
          const desiredSize = controller.desiredSize;
          if (desiredSize === null || desiredSize > 0) {
            clearBackpressureTimer();
            return true;
          }
          if (!backpressureTimer) {
            scheduleBackpressureClose();
          }
          return false;
        };

        const enqueue = (chunk: Uint8Array): boolean => {
          if (!checkBackpressure()) return false;
          try {
            controller.enqueue(chunk);
            checkBackpressure();
            return true;
          } catch {
            close();
            return false;
          }
        };

        const close = () => {
          if (closed) return;
          closed = true;
          pullRefresh = () => undefined;
          unsubscribe?.();
          if (heartbeat) clearInterval(heartbeat);
          if (expiry) clearTimeout(expiry);
          clearBackpressureTimer();
          request.signal.removeEventListener("abort", close);
          try {
            controller.close();
          } catch {
            // The client may have cancelled between an abort and this callback.
          }
        };
        closeStream = close;

        const enqueueSnapshot = (snapshot: {
          revision: number;
          data: unknown;
        }) => {
          if (snapshot.revision <= lastSentRevision) return true;
          if (
            !enqueue(
              encoder.encode(snapshotEvent(snapshot.revision, snapshot.data)),
            )
          ) {
            refreshPending = true;
            return false;
          }
          lastSentRevision = snapshot.revision;
          return true;
        };

        const refreshSnapshot = async () => {
          if (closed) return false;
          if (!checkBackpressure()) {
            refreshPending = true;
            return false;
          }
          const snapshot = await definition.loadSnapshot(
            parsed,
            authorization,
            context,
          );
          if (closed) return false;
          return enqueueSnapshot(snapshot);
        };

        const runRefresh = async () => {
          try {
            do {
              refreshPending = false;
              if (!(await refreshSnapshot())) return;
            } while (refreshPending && !closed);
          } catch (error) {
            console.error("[live] failed to refresh topic", error);
          } finally {
            finishRefresh();
          }
        };

        const finishRefresh = () => {
          refreshRunning = false;
          if (refreshPending && !closed) refresh();
        };

        const refresh = () => {
          if (closed) return;
          if (refreshRunning) {
            refreshPending = true;
            return;
          }
          if (!checkBackpressure()) {
            refreshPending = true;
            return;
          }

          refreshRunning = true;
          void runRefresh();
        };
        pullRefresh = () => {
          if (!refreshRunning && refreshPending) refresh();
        };

        unsubscribe = subscribeLive(topic, () => refresh());
        request.signal.addEventListener("abort", close, { once: true });
        heartbeat = setInterval(() => {
          if (!closed) enqueue(encoder.encode(": heartbeat\n\n"));
        }, HEARTBEAT_MS);
        expiry = setTimeout(close, MAX_STREAM_MS);
        void waitForLiveReady()
          .catch((error) => {
            console.error("[live] listener did not become ready", error);
          })
          .finally(() => {
            if (!closed) refresh();
          });
      },
      pull() {
        pullRefresh();
      },
      cancel() {
        closeStream();
      },
    },
    new CountQueuingStrategy({ highWaterMark: 8 }),
  );

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
