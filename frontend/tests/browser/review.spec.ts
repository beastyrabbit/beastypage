import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
});

test("Quick Share handles a history 500 and recovers on refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/i/api/policy", (route) =>
    route.fulfill({
      json: {
        maxBytes: 104857600,
        hourlyStarts: 10,
        dailyBytes: 1073741824,
        active: 5,
        smallCutoffBytes: 10485760,
        smallLifetimeMs: 86400000,
        largeLifetimeMs: 3600000,
        chunkBytes: 5242880,
      },
    }),
  );
  let fail = true;
  await page.route("**/i/api/account/uploads", (route) =>
    route.fulfill({
      status: fail ? 500 : 200,
      json: fail ? { error: "Service unavailable" } : [],
    }),
  );
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=quick-share`);
  await expect(page.getByRole("alert")).toContainText(
    "Recent shares could not be loaded",
  );
  await page.screenshot({
    path: "../.playwright-mcp/quick-share-history-error.png",
  });
  fail = false;
  await page.getByRole("button", { name: "Refresh recent shares" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("Your active and recent shares will appear here."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("host sign-in gate has a visible sign-in control", async ({ page }) => {
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=host`);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sign in to create a session and manage viewer votes."),
  ).toBeVisible();
  await page.screenshot({ path: "../.playwright-mcp/host-sign-in.png" });
});

test("Quick Share exposes native upload progress and an accessible clipboard textbox", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/i/api/policy", (route) =>
    route.fulfill({
      json: {
        maxBytes: 104857600,
        hourlyStarts: 10,
        dailyBytes: 1073741824,
        active: 5,
        smallCutoffBytes: 10485760,
        smallLifetimeMs: 86400000,
        largeLifetimeMs: 3600000,
        chunkBytes: 4,
      },
    }),
  );
  await page.route("**/i/api/account/uploads", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/i/api/uploads", (route) =>
    route.fulfill({
      json: {
        uploadId: "fixture-progress",
        slug: "fixture-progress",
        receipt: "fixture-only",
        url: "/i/fixture-progress",
        publicExpiresAt: Date.now() + 86400000,
        chunkBytes: 4,
      },
    }),
  );
  await page.route("**/i/api/uploads/fixture-progress/status", (route) =>
    route.fulfill({
      json: {
        state: "uploading",
        parts: [{ partNumber: 1, size: 4 }],
      },
    }),
  );
  let heldPart: import("@playwright/test").Route | undefined;
  await page.route("**/i/api/uploads/fixture-progress/parts/2", (route) => {
    heldPart = route;
  });
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=quick-share`);
  await page.getByRole("tab", { name: "Clipboard", exact: true }).click();
  const clipboard = page.getByRole("textbox", {
    name: "Paste an image from the clipboard",
  });
  await expect(clipboard).toBeVisible();
  await expect(clipboard).toHaveAttribute("contenteditable", "true");
  await clipboard.focus();
  await expect(clipboard).toBeFocused();
  await page.getByRole("tab", { name: "Photo/video", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(8),
  });
  await page.getByRole("button", { name: "Create link", exact: true }).click();
  await expect.poll(() => Boolean(heldPart)).toBe(true);
  const progress = page.getByRole("progressbar", { name: "Upload progress" });
  await expect(progress).toBeVisible();
  expect(await progress.evaluate((el) => el.tagName)).toBe("PROGRESS");
  await expect(progress).toHaveAttribute("max", "100");
  await expect(progress).toHaveAttribute("value", "50");
  await expect(progress).toHaveAttribute(
    "aria-valuetext",
    "Uploading progress.png · 4 B of 8 B",
  );
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "../.playwright-mcp/sonar-quick-share-progress.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page.goto("about:blank");
});

test("Catdex cards open with Enter and Space", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${process.env.BROWSER_FIXTURE_URL}?view=catdex&catdexCard=1`,
  );
  const card = page.getByRole("button").filter({
    has: page.getByRole("heading", { name: "Keyboard cat", level: 3 }),
  });
  await expect(card).toBeVisible();
  await card.focus();
  await expect(card).toBeFocused();
  await page.screenshot({
    path: "../.playwright-mcp/sonar-catdex-keyboard-01.png",
  });
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Keyboard cat", level: 2 }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.playwright-mcp/sonar-catdex-keyboard-02.png",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Keyboard cat", level: 2 }),
  ).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.screenshot({
    path: "../.playwright-mcp/sonar-catdex-keyboard-03.png",
  });
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Keyboard cat", level: 2 }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.playwright-mcp/sonar-catdex-keyboard-04.png",
  });
  expect(errors).toEqual([]);
});

test("host can recover from a legacy or unavailable session link", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${process.env.BROWSER_FIXTURE_URL}?view=host&signedIn=1&session=legacy-session`,
  );
  await expect(
    page.getByText(
      "This session is unavailable to your account. Older sessions cannot be resumed. Create a new session to continue.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start new session", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("Catdex shows the styled load-more control", async ({ page }) => {
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=catdex`);
  await expect(
    page.getByRole("button", { name: "Load more cards", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "../.playwright-mcp/catdex-load-more.png" });
});

test("collection supports keyboard opening, focus containment, Escape, and restoration", async ({
  page,
}) => {
  await page.goto(process.env.BROWSER_FIXTURE_URL!);
  const open = page.getByRole("button", { name: "Open Cat by Test artist" });
  await expect(open).toBeVisible();
  for (
    let i = 0;
    i < 10 && !(await open.evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(open).toBeFocused();
  await page.screenshot({ path: "../.playwright-mcp/collection-focused.png" });
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Test artist" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .getByRole("img", { name: "Cat", exact: true })
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.screenshot({
    path: "../.playwright-mcp/collection-keyboard-dialog.png",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.screenshot({ path: "../.playwright-mcp/collection-restored.png" });
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("profile describes the saved-variants reset truthfully", async ({
  page,
}) => {
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=profile`);
  await expect(
    page.getByText("Reset saved variants", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Remove saved variants. Your account, profile, shared content, and sessions remain.",
    ),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.screenshot({
    path: "../.playwright-mcp/profile-reset.png",
    fullPage: true,
  });
});

test("collection dialog keeps its close control visible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.BROWSER_FIXTURE_URL!);
  await page.getByRole("button", { name: "Open Cat by Test artist" }).click();
  const close = page.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeInViewport();
  await expect(close).toBeFocused();
  await page.screenshot({ path: "../.playwright-mcp/collection-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Pixelator cancels obsolete processing and clears results when steps are disabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto(`${process.env.BROWSER_FIXTURE_URL}?view=pixelator`);
  await page
    .locator('input[type="file"]')
    .setInputFiles(resolve("public/sprites/fademask.png"));
  await expect(
    page.getByRole("button", { name: "Change Image" }),
  ).toBeVisible();
  const requests: import("@playwright/test").Route[] = [];
  await page.route("**/api/pixelator", (route) => {
    requests.push(route);
  });
  const source = page.getByRole("button", {
    name: "Nearest Neighbor",
    exact: true,
  });
  const target = page.getByText("Drag operations here to build your pipeline");
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(() => requests.length).toBe(1);
  const failed = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/api/pixelator"),
  );
  await page.getByRole("checkbox").first().uncheck();
  await failed;
  await expect(page.getByText("Processing...", { exact: true })).toHaveCount(0);
  await requests[0]!.fulfill({
    json: { image: "data:image/png;base64,stale", meta: { duration_ms: 1 } },
  });
  await expect(
    page.getByRole("button", { name: "Show Original", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox").first().check();
  await expect.poll(() => requests.length).toBe(2);
  const original = await page
    .getByRole("img", { name: "Processed result" })
    .getAttribute("src");
  await requests[1]!.fulfill({
    json: { image: original, meta: { duration_ms: 2 } },
  });
  await expect(
    page.getByRole("button", { name: "Show Original", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.playwright-mcp/pixelator-current.png",
    fullPage: true,
  });
  await page.getByRole("slider").first().fill("20");
  await expect(
    page.getByText(
      "Previous result. Current settings have not been rendered yet.",
    ),
  ).toBeVisible();
  const staleStatus = page
    .getByRole("status")
    .filter({ hasText: "Previous result." });
  await expect(staleStatus).toBeVisible();
  expect(await staleStatus.evaluate((el) => el.tagName)).toBe("OUTPUT");
  await expect(
    page.getByRole("img", { name: "Processed result" }),
  ).toHaveAttribute("src", original!);
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
  await expect.poll(() => requests.length).toBe(3);
  await page.screenshot({
    path: "../.playwright-mcp/pixelator-stale.png",
    fullPage: true,
  });
  await requests[2]!.fulfill({
    json: { image: original, meta: { duration_ms: 3 } },
  });
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeEnabled();
  await expect(
    page.getByText(
      "Previous result. Current settings have not been rendered yet.",
    ),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../.playwright-mcp/pixelator-refreshed.png",
    fullPage: true,
  });
  await page.getByRole("checkbox").first().uncheck();
  await expect(
    page.getByRole("button", { name: "Show Original", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../.playwright-mcp/pixelator-disabled.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Change Image" }).click();
  await expect(page.getByRole("img", { name: "Processed result" })).toHaveCount(
    0,
  );
});
