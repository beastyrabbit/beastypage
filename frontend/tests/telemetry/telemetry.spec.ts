import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { isDeclaredStorageKey } from "../../lib/telemetry/storage-inventory";

const fixtures = resolve(process.cwd(), "tests/telemetry/fixtures");
const screenshots = resolve(process.cwd(), "../.playwright-mcp");

async function stubServices(page: Page) {
  // Always sample the recorder in this isolated test, including its storage behavior.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const sends: { type: string; payload: Record<string, unknown> }[] = [];
  const records: unknown[] = [];
  const umamiRequests: string[] = [];
  const envelopes: string[] = [];
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "umami.telemetry.test") {
      umamiRequests.push(url.pathname);
      if (["/script.js", "/recorder.js"].includes(url.pathname))
        return route.fulfill({
          path: resolve(fixtures, url.pathname.slice(1)),
          contentType: "application/javascript",
        });
      if (url.pathname.endsWith("/recorder"))
        return route.fulfill({
          json: {
            enabled: true,
            replayEnabled: true,
            heatmapEnabled: true,
            sampleRate: 1,
            heatmapSampleRate: 1,
            maskLevel: "moderate",
          },
        });
      if (url.pathname === "/api/send") {
        sends.push(route.request().postDataJSON());
        return route.fulfill({ json: { cache: "fixture-session" } });
      }
      if (url.pathname === "/api/record") {
        records.push(route.request().postDataJSON());
        return route.fulfill({ json: {} });
      }
    }
    if (url.hostname === "clerk.telemetry.test") {
      if (url.pathname.endsWith(".js"))
        return route.fulfill({
          path: resolve(fixtures, "clerk.js"),
          contentType: "application/javascript",
        });
      return route.fulfill({ json: { response: null } });
    }
    if (
      url.hostname === "127.0.0.1" &&
      url.pathname.includes("/api/1/envelope")
    ) {
      envelopes.push(route.request().postData() ?? "");
      return route.fulfill({ json: {} });
    }
    if (url.hostname === "127.0.0.1") return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  return { sends, records, umamiRequests, envelopes, external };
}

async function assertStorage(page: Page) {
  const cookies = await page.context().cookies();
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  for (const key of [
    ...cookies.map((cookie) => cookie.name),
    ...storage.local,
    ...storage.session,
  ])
    expect(
      isDeclaredStorageKey(key),
      `Undeclared browser storage: ${key}`,
    ).toBe(true);
  expect(cookies.every((cookie) => !/umami|sentry/i.test(cookie.name))).toBe(
    true,
  );
  expect(
    [...storage.local, ...storage.session].every((key) => !/sentry/i.test(key)),
  ).toBe(true);
  return { cookies: cookies.map((cookie) => cookie.name), ...storage };
}

test("built app enforces consent, tracks SPA pageviews, scrubs errors, and stores only declared keys", async ({
  page,
}) => {
  const { sends, records, umamiRequests, envelopes, external } =
    await stubServices(page);
  await page.goto("/projects/tools?token=private-query#private-fragment");
  await expect(
    page.getByRole("heading", { name: "Your privacy, your choice" }),
  ).toBeVisible();
  expect(
    await page.locator('script[src*="umami.telemetry.test"]').count(),
  ).toBe(0);
  expect(sends).toHaveLength(0);
  expect(umamiRequests).toHaveLength(0);
  const before = await assertStorage(page);
  // SDK is intentionally loaded after hydration. Wait for its own transport
  // by throwing a real asynchronous error; no debug endpoint exists in the app.
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error(
        "Telemetry test person@example.com Bearer private-bearer https://site.test/?token=private-token",
      );
    }, 1500),
  );
  await expect
    .poll(
      () => envelopes.some((envelope) => envelope.includes("Telemetry test")),
      { timeout: 20_000 },
    )
    .toBe(true);
  const error =
    envelopes.find((envelope) => envelope.includes("Telemetry test")) ?? "";
  expect(error).toContain('"release":"beastypage@v0.0.0-telemetry-test"');
  expect(error).toContain('"environment":"production"');
  expect(error).not.toContain("person@example.com");
  expect(error).not.toContain("private-bearer");
  expect(error).not.toContain("private-token");
  await page.evaluate(() => {
    console.error("Telemetry console fixture person@example.com");
    void Promise.reject(
      new Error("Telemetry rejection fixture token=private-rejection"),
    );
  });
  await expect
    .poll(() =>
      envelopes.some((envelope) =>
        envelope.includes("Telemetry console fixture"),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      envelopes.some((envelope) =>
        envelope.includes("Telemetry rejection fixture"),
      ),
    )
    .toBe(true);
  expect(envelopes.join("\n")).not.toContain("private-rejection");
  expect(envelopes.join("\n")).not.toContain("person@example.com");
  const afterError = await assertStorage(page);
  expect(afterError).toEqual(before);

  await page
    .getByRole("button", { name: "Accept analytics", exact: true })
    .click();
  await expect
    .poll(
      () =>
        sends.filter((event) => event.type === "event" && !event.payload.name)
          .length,
    )
    .toBe(1);
  await expect(page.locator('script[src$="/recorder.js"]')).toHaveCount(1);
  await expect.poll(() => records.length).toBeGreaterThan(0);
  expect(JSON.stringify(records)).not.toContain("private-query");
  expect(JSON.stringify(records)).not.toContain("private-fragment");
  expect(JSON.stringify(sends)).not.toContain("private-query");
  expect(JSON.stringify(sends)).not.toContain("private-fragment");
  console.log("[telemetry] storage after consent", await assertStorage(page));

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect
    .poll(
      () =>
        sends.filter((event) => event.type === "event" && !event.payload.name)
          .length,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "Cookie settings", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cookie and storage settings" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Cookie and storage settings" })
    .getByRole("button", { name: "Necessary only", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cookie settings", exact: true }).last(),
  ).toBeVisible();
  await expect(page.locator('script[src*="umami.telemetry.test"]')).toHaveCount(
    0,
  );
  const countAfterWithdrawal = sends.length;
  await page.getByRole("link", { name: "Personal", exact: true }).click();
  await page.waitForTimeout(1200);
  expect(sends).toHaveLength(countAfterWithdrawal);
  await assertStorage(page);
  expect(external).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`consent and footer visuals at ${width}px`, async ({ page }) => {
    await stubServices(page);
    await mkdir(screenshots, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { name: "Your privacy, your choice" }),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: resolve(screenshots, `telemetry-banner-${width}.png`),
    });
    await page
      .getByRole("button", { name: "Choose settings", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Cookie and storage settings" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Cookie and storage settings" })
      .getByRole("button", { name: "Necessary storage", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Cookie and storage settings" })
        .getByText("cc_cookie", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: resolve(screenshots, `telemetry-preferences-${width}.png`),
    });
    await page
      .getByRole("dialog", { name: "Cookie and storage settings" })
      .getByRole("button", { name: "Necessary only", exact: true })
      .click();
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: resolve(screenshots, `telemetry-footer-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
