import { NextResponse } from "next/server";
import { isServiceError } from "./errors";

/**
 * Maps service errors to the HTTP error contract (ADR §8):
 * `{ error: <message>, code: <code> }`. Anything else is logged and becomes
 * a generic 500 with the caller-supplied message.
 */
export function errorResponse(
  error: unknown,
  fallback: string,
  context: string,
) {
  if (isServiceError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error(context, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
