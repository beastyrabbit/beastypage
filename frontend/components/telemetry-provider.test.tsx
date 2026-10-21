import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TelemetryProvider } from "./telemetry-provider";

const auth = vi.hoisted(() => ({ isLoaded: false, isSignedIn: false }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => auth }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));
vi.mock("vanilla-cookieconsent", () => ({
  run: vi.fn().mockResolvedValue(undefined),
  acceptedCategory: () => false,
  reset: vi.fn(),
}));
vi.mock("@/lib/telemetry/umami", () => ({ createUmamiLoader: () => vi.fn() }));

afterEach(() => {
  auth.isLoaded = false;
  auth.isSignedIn = false;
});

it("blocks replay during Clerk loading and sign-in, masking only known anonymous content", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    const render = () =>
      act(async () =>
        root.render(<TelemetryProvider>Private content</TelemetryProvider>),
      );
    await render();
    expect(container.firstElementChild?.className).toBe("rr-block");
    auth.isLoaded = true;
    await render();
    expect(container.firstElementChild?.className).toBe("rr-mask");
    auth.isSignedIn = true;
    await render();
    expect(container.firstElementChild?.className).toBe("rr-block");
    auth.isLoaded = false;
    await render();
    expect(container.firstElementChild?.className).toBe("rr-block");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
