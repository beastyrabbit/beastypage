import "server-only";

import type { LiveTopicDefinition } from "@/server/live/topics/types";
import { testLiveTopic } from "@/server/live/topics/test";

// Future topic families add one descriptor to this list.
export const liveTopics: LiveTopicDefinition[] = [
  // Add real stream, cat-stream, vote, and wheel descriptors here.
  ...(process.env.NODE_ENV === "production" ? [] : [testLiveTopic]),
];

export function findLiveTopic(topic: string): LiveTopicDefinition | null {
  for (const definition of liveTopics) {
    if (definition.parse(topic) !== null) return definition;
  }
  return null;
}

export { testLiveTopic } from "@/server/live/topics/test";
export type {
  LiveSnapshot,
  LiveTopic,
  LiveTopicContext,
  LiveTopicDefinition,
} from "@/server/live/topics/types";
