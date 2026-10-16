import "server-only";

import { timingSafeEqual } from "node:crypto";
import { withTransaction } from "../../db/transaction";
import { selectCatStreamSession } from "../../repositories/catStream";
import { selectStreamSession } from "../../repositories/stream";
import { getUserByTokenIdentifier } from "../../repositories/users";
import { getCatStreamSnapshot } from "../../services/catStream";
import { getStreamSnapshot } from "../../services/stream";
import { findUserByApiKey } from "../../services/users";
import type { LiveTopicDefinition } from "./types";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Params = { id: string };
type Auth = {
  id: string;
  host: boolean;
  viewerSession?: string;
  stepId?: string;
};

export const streamTopic: LiveTopicDefinition<Params, Auth> = {
  family: "stream",
  parse(topic) {
    const match = /^stream\/([0-9a-f-]{36})$/.exec(topic);
    return match ? { id: match[1] } : null;
  },
  async authorize(params, context) {
    const row = await selectStreamSession(context.db, params.id);
    if (!row) return null;
    const viewerKey = context.request.nextUrl.searchParams.get("viewerKey");
    if (viewerKey && equal(viewerKey, row.viewerKey))
      return {
        id: row.id,
        host: false,
        viewerSession:
          context.request.nextUrl.searchParams.get("viewerSession") ??
          undefined,
        stepId: context.request.nextUrl.searchParams.get("stepId") ?? undefined,
      };
    if (
      context.identity.tokenIdentifier &&
      row.ownerTokenIdentifier === context.identity.tokenIdentifier
    )
      return {
        id: row.id,
        host: true,
        viewerSession:
          context.request.nextUrl.searchParams.get("viewerSession") ??
          undefined,
        stepId: context.request.nextUrl.searchParams.get("stepId") ?? undefined,
      };
    return null;
  },
  async loadSnapshot(params, authorization, context) {
    const snapshot = await getStreamSnapshot(
      context.db,
      params.id,
      authorization,
    );
    if (!snapshot) return { revision: 0, data: null };
    if (authorization.host || authorization.viewerSession) return snapshot;
    return {
      revision: snapshot.revision,
      data: { ...snapshot.data, participants: [] },
    };
  },
};

export const catStreamTopic: LiveTopicDefinition<Params, Auth> = {
  family: "cat-stream",
  parse(topic) {
    const match = /^cat-stream\/([0-9a-f-]{36})$/.exec(topic);
    return match ? { id: match[1] } : null;
  },
  async authorize(params, context) {
    const session = await selectCatStreamSession(context.db, params.id);
    if (!session) return null;
    const key = context.request.nextUrl.searchParams.get("key");
    if (key) {
      const user = await findUserByApiKey(context.db, key);
      if (user?.id === session.userId) return { id: session.id, host: false };
      return null;
    }
    if (context.identity.tokenIdentifier) {
      const user = await withTransaction(context.db, (tx) =>
        getUserByTokenIdentifier(
          tx,
          context.identity.tokenIdentifier as string,
        ),
      );
      if (user?.id === session.userId) return { id: session.id, host: true };
    }
    return null;
  },
  async loadSnapshot(params, _authorization, context) {
    return (
      (await getCatStreamSnapshot(context.db, params.id)) ?? {
        revision: 0,
        data: null,
      }
    );
  },
};
