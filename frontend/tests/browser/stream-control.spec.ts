import { expect, test } from "@playwright/test";

function fixtureUrl(query = "") {
  return new URL(`stream-control.html${query}`, process.env.BROWSER_FIXTURE_URL)
    .href;
}

test("first login waits for profile provisioning before creating a stream session", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixtureUrl("?fresh=1"));
  await expect
    .poll(() => page.evaluate(() => window.streamFixture.requests))
    .toContain("session:read");
  await expect
    .poll(() => page.evaluate(() => window.streamFixture.requests))
    .toContain("viewer:pending");
  await expect(
    page.getByRole("button", { name: "Spin!", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.streamFixture.requests),
  ).not.toContain("ensureSession");
  await page.evaluate(() => window.streamFixture.completeProfile());
  await expect
    .poll(() => page.evaluate(() => window.streamFixture.requests))
    .toContain("ensureSession");
  const requests = await page.evaluate(() => window.streamFixture.requests);
  expect(requests.indexOf("ensureSession")).toBeGreaterThan(
    requests.indexOf("profile:ready"),
  );
  await expect(page.getByRole("button", { name: "User menu" })).toHaveText("L");
  expect(errors).toEqual([]);
});

for (const width of [360, 390, 430]) {
  test(`Stream Control fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(fixtureUrl());
    const countdown = page.getByRole("slider", {
      name: "Countdown",
      exact: true,
    });
    const speed = page.getByRole("slider", { name: "Speed", exact: true });
    await expect(countdown).toBeVisible();
    await expect(speed).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    for (const slider of [countdown, speed]) {
      const bounds = await slider.boundingBox();
      if (!bounds) throw new Error("Slider is not laid out");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await countdown.fill("0");
    await speed.fill("4");
    await expect(countdown).toHaveValue("0");
    await expect(speed).toHaveValue("4");
    await page.screenshot({
      path: `../.playwright-mcp/stream-control-${width}.png`,
      fullPage: true,
    });
  });
}

test("desktop trigger remains pixel-identical to its original layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixtureUrl());
  const trigger = page
    .locator("section")
    .filter({ has: page.getByText("Trigger", { exact: true }) });
  await expect(trigger).toBeVisible();
  const after = await trigger.screenshot({
    path: "../.playwright-mcp/stream-trigger-desktop-after.png",
    animations: "disabled",
  });
  await trigger.evaluate((section) => {
    const row = section.querySelector(".flex-wrap");
    const sliders = section.querySelector('[class*="max-sm:basis-full"]');
    if (!row || !sliders) throw new Error("Missing trigger layout");
    row.className = "mb-4 flex items-center gap-3";
    sliders.className = "flex flex-1 items-center gap-4";
  });
  const before = await trigger.screenshot({
    path: "../.playwright-mcp/stream-trigger-desktop-before.png",
    animations: "disabled",
  });
  expect(after.equals(before)).toBe(true);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`OBS lobby keeps its fixed stage at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(fixtureUrl("?obs=1"));
    await expect(
      page.getByText("Spin Settings", { exact: true }),
    ).toBeAttached();
    await expect(page.locator('[style*="width: 1920px"]').first()).toHaveCSS(
      "width",
      "1920px",
    );
    await page.screenshot({
      path: `../.playwright-mcp/stream-obs-lobby-${viewport.width}.png`,
    });
    expect(errors).toEqual([]);
  });
}
