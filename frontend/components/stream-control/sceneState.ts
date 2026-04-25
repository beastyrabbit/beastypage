export type StreamSceneButtonId = "lobby" | "brb" | "test";

type StreamSceneSession = {
  status?: string | null;
  testMode?: boolean | null;
  currentCommand?: {
    type?: string | null;
  } | null;
};

export function getActiveStreamScene(
  session: StreamSceneSession | null | undefined,
): StreamSceneButtonId | null {
  if (!session) return null;
  if (session.testMode) return "test";
  if (session.status !== "active") return null;

  switch (session.currentCommand?.type) {
    case "lobby":
      return "lobby";
    case "brb":
      return "brb";
    default:
      return null;
  }
}
