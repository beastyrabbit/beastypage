import "server-only";

import { desc, eq } from "drizzle-orm";
import { liveEvents } from "@/server/db/schema/system";
import type {
  LiveSnapshot,
  LiveTopicDefinition,
} from "@/server/live/topics/types";

interface TestParams {
  name: string;
}

interface TestAuthorization {
  key: string;
}

interface TestData {
  revision: number;
}

const TEST_KEY = "test-live-key";

/**
 * Database-backed topic used by infrastructure tests. The registry excludes
 * it when NODE_ENV=production, so it cannot be exposed by a production app.
 */
export const testLiveTopic: LiveTopicDefinition<
  TestParams,
  TestAuthorization,
  TestData
> = {
  family: "test",
  parse(topic): TestParams | null {
    const match = /^test\/([A-Za-z0-9_-]{1,100})$/.exec(topic);
    return match ? { name: match[1] } : null;
  },
  async authorize(_params, context): Promise<TestAuthorization | null> {
    return context.request.nextUrl.searchParams.get("key") === TEST_KEY
      ? { key: TEST_KEY }
      : null;
  },
  async loadSnapshot(
    params,
    _authorization,
    context,
  ): Promise<LiveSnapshot<TestData>> {
    const topic = `test/${params.name}`;
    const [event] = await context.db
      .select({ revision: liveEvents.revision })
      .from(liveEvents)
      .where(eq(liveEvents.topic, topic))
      .orderBy(desc(liveEvents.id))
      .limit(1);
    const revision = event?.revision ?? 0;
    return {
      revision,
      data: { revision },
    };
  },
};

export const TEST_LIVE_KEY = TEST_KEY;
