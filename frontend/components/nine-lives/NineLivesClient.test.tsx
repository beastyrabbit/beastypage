import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setAnalyticsConsent } from "@/lib/telemetry/consent-state";
import { NineLivesClient } from "./NineLivesClient";

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openSignIn: vi.fn() }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const GAME_ORIGIN = "https://ninelives.beastyrabbit.com";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setAnalyticsConsent(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setAnalyticsConsent(false);
  vi.unstubAllGlobals();
});

async function startGame() {
  await act(async () => root.render(<NineLivesClient />));
  const start = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Press START"),
  );
  await act(async () => start?.click());
  const iframe = container.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("game frame did not mount");
  const postMessage = vi.spyOn(iframe.contentWindow, "postMessage");
  const consentMessages = () =>
    postMessage.mock.calls.filter(
      ([message]) => message?.type === "nine-lives:consent",
    );
  const sendReady = (origin = GAME_ORIGIN) =>
    act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source: iframe.contentWindow,
          data: { type: "nine-lives:ready", v: 1 },
        }),
      );
    });
  return { consentMessages, sendReady };
}

it("sends the current analytics choice to the game origin on every ready", async () => {
  const { consentMessages, sendReady } = await startGame();

  await sendReady("https://evil.example");
  expect(consentMessages()).toEqual([]);

  await sendReady();
  expect(consentMessages()).toEqual([
    [{ type: "nine-lives:consent", v: 1, analytics: false }, GAME_ORIGIN],
  ]);

  setAnalyticsConsent(true);
  // A withdrawal reloads the game, which asks again with a fresh ready.
  await sendReady();
  expect(consentMessages().at(-1)).toEqual([
    { type: "nine-lives:consent", v: 1, analytics: true },
    GAME_ORIGIN,
  ]);
});

it("sends each consent change while the game is loaded", async () => {
  const { consentMessages, sendReady } = await startGame();
  await sendReady();

  setAnalyticsConsent(true);
  setAnalyticsConsent(true);
  setAnalyticsConsent(false);

  expect(consentMessages()).toEqual([
    [{ type: "nine-lives:consent", v: 1, analytics: false }, GAME_ORIGIN],
    [{ type: "nine-lives:consent", v: 1, analytics: true }, GAME_ORIGIN],
    [{ type: "nine-lives:consent", v: 1, analytics: false }, GAME_ORIGIN],
  ]);
});
