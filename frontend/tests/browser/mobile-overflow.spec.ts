import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const widths = [360, 390, 430, 1280];

function fixtureUrl(view: string) {
  const url = new URL("a11y-semantics.html", process.env.BROWSER_FIXTURE_URL);
  url.searchParams.set("view", view);
  return url.href;
}

async function expectPageToFit(page: Page, name: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${name} at ${width}px`,
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.playwright-mcp/overflow-${name}-${width}.png`,
    });
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
});

test("single cat fits before and after generation and downloads native PNG", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(fixtureUrl("single"));
  await expectPageToFit(page, "single");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) =>
      schedule(
        handler,
        Math.min(delay ?? 0, 10),
        ...args,
      )) as typeof setTimeout;
  });
  await page.getByRole("button", { name: "Generate Cat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Sprite Gallery", exact: true }),
  ).toBeEnabled({ timeout: 90_000 });
  await expectPageToFit(page, "single-generated");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("PNG download was not saved");
  const png = await readFile(downloadPath);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([720, 720]);
});

test("adoption cards and large preview fit without resizing the canvas", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(fixtureUrl("adoption"));
  await page.evaluate(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) =>
      schedule(
        handler,
        Math.min(delay ?? 0, 10),
        ...args,
      )) as typeof setTimeout;
  });
  await page.getByRole("button", { name: "Fast", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate Adoption", exact: true })
    .click();
  const preview = page.locator(".cat-preview").first();
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await expectPageToFit(page, "adoption");
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const grid = page.locator("#catGrid");
    expect(await grid.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      await grid.evaluate((el) => el.clientWidth),
    );
  }
  await preview.click();
  await expect(page.locator(".quick-preview-popup")).toBeVisible();
  const canvas = page.locator(".quick-preview-canvas");
  await expect(canvas).toHaveJSProperty("width", 700);
  await expect(canvas).toHaveJSProperty("height", 700);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    for (const selector of [".quick-preview-content", ".quick-preview-close"]) {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} has no visible bounds`);
      expect(box.x, `${selector} left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${selector} right at ${width}px`,
      ).toBeLessThanOrEqual(width);
    }
    await page.screenshot({
      path: `../.playwright-mcp/overflow-adoption-preview-${width}.png`,
    });
  }
  await page.locator(".quick-preview-close").click();
  await expect(page.locator(".quick-preview-popup")).not.toBeVisible();
});

test("saved adoption batch and open preview fit narrow viewports", async ({
  page,
}) => {
  await page.goto(fixtureUrl("batch"));
  const preview = page.getByRole("button", { name: "Open preview for Sunfur" });
  await expect(preview).toBeVisible();
  await expectPageToFit(page, "batch");
  await preview.click();
  await expect(page.getByRole("dialog", { name: "Sunfur" })).toBeVisible();
  await expectPageToFit(page, "batch-preview");
});
