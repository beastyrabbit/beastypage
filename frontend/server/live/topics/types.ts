import "server-only";

import type { NextRequest } from "next/server";
import type { Identity } from "@/server/auth/identity";
import type { Database } from "@/server/db/pool";

export interface LiveSnapshot<TData = unknown> {
  revision: number;
  data: TData;
}

export interface LiveTopicContext {
  request: NextRequest;
  identity: Identity;
  db: Database;
}

export interface LiveTopicDefinition<
  TParams = unknown,
  TAuthorization = unknown,
  TData = unknown,
> {
  /** Stable family name used in diagnostics and documentation. */
  readonly family: string;
  /** Returns parsed topic parameters, or null when this family does not match. */
  parse(topic: string): TParams | null;
  /** Performs the same credential check as the matching read operation. */
  authorize(
    params: TParams,
    context: LiveTopicContext,
  ): Promise<TAuthorization | null>;
  /** Loads the authorized aggregate snapshot. */
  loadSnapshot(
    params: TParams,
    authorization: TAuthorization,
    context: LiveTopicContext,
  ): Promise<LiveSnapshot<TData>>;
}

export type LiveTopic<
  TParams = unknown,
  TAuthorization = unknown,
  TData = unknown,
> = LiveTopicDefinition<TParams, TAuthorization, TData>;
