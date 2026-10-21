import { expect, test } from "@playwright/test";

// Local production server only. No credentials, live providers, or database needed.
const baseUrl = process.env.LEGAL_TEST_BASE_URL ?? "";
test.skip(
  !baseUrl,
  "Set LEGAL_TEST_BASE_URL to the local Next.js production server.",
);
if (
  baseUrl &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)
)
  throw new Error("LEGAL_TEST_BASE_URL must be localhost.");

const routes = [
  [
    "Impressum",
    "/impressum",
    "de",
    "impressum-beastyrabbit@heerlab.com",
    "/legal-notice",
  ],
  [
    "Datenschutz",
    "/datenschutz",
    "de",
    "datenschutz-beastyrabbit@heerlab.com",
    "/privacy",
  ],
  [
    "Legal notice",
    "/legal-notice",
    "en",
    "impressum-beastyrabbit@heerlab.com",
    "/impressum",
  ],
  [
    "Privacy",
    "/privacy",
    "en",
    "datenschutz-beastyrabbit@heerlab.com",
    "/datenschutz",
  ],
] as const;

for (const width of [1280, 390]) {
  test.describe(`Legal pages at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 1280 ? 800 : 844 } });
    test.beforeEach(async ({ page }) => {
      // Skip Clerk's development-browser handshake while remaining signed out.
      // This is a synthetic browser marker, not a session or authentication token.
      const context = page.context();
      await context.addCookies([
        {
          name: "__clerk_db_jwt",
          value: "offline-test-browser",
          url: baseUrl,
        },
      ]);
      // Also block same-origin telemetry proxies, which could relay to a third party.
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === new URL(baseUrl).origin &&
          !url.pathname.startsWith("/bubu")
          ? route.continue()
          : route.abort();
      });
    });

    for (const [label, path, lang, email, counterpart] of routes) {
      test(`follows ${label} from the home footer`, async ({ page }) => {
        await page.goto(baseUrl);
        const link = page
          .locator("footer")
          .getByRole("link", { name: label, exact: true });
        await expect(link).not.toHaveAttribute("target", "_blank");
        await link.click();
        await expect(page).toHaveURL(`${baseUrl}${path}`);
        const main = page.locator("main");
        await expect(main).toHaveAttribute("lang", lang);
        for (const content of [
          "Tobias Heer",
          "c/o Impressumservice Dein-Impressum",
          "Stettiner Str. 41",
          "35410 Hungen",
          email,
        ])
          await expect(main).toContainText(content);
        await expect(
          main.locator(`a[href="mailto:${email}"]`).first(),
        ).toBeVisible();
        await expect(
          main
            .locator(
              'a[href="https://beastyrabbit.com/kontakt?from=beastyrabbit"]',
            )
            .first(),
        ).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          "noindex, follow",
        );
        await expect(
          main.locator(`a[href="${counterpart}"]`).first(),
        ).toBeVisible();
        await expect(main).not.toContainText(
          /impressum@heerlab\.com|datenschutz@heerlab\.com|Hetzner|thecolorapi/i,
        );
        if (path === "/datenschutz" || path === "/privacy") {
          await expect(main.locator("h2")).toHaveCount(19);
          await expect(main.locator("table")).toHaveCount(1);
          const tableRegion = main.getByRole("region");
          if (width === 390) {
            expect(
              await tableRegion.evaluate(
                (el) => el.scrollWidth > el.clientWidth,
              ),
            ).toBe(true);
            await tableRegion.focus();
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(() => tableRegion.evaluate((el) => el.scrollLeft))
              .toBeGreaterThan(0);
          }
          await page.screenshot({
            path: `../.playwright-mcp/legal-storage-${path.slice(1)}-${width}.png`,
            animations: "disabled",
          });
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: `../.playwright-mcp/legal-${path.slice(1)}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
        await main.locator(`a[href="${counterpart}"]`).first().click();
        await expect(page).toHaveURL(`${baseUrl}${counterpart}`);
      });
    }

    test("retains footer links on a 404", async ({ page }) => {
      const response = await page.goto(
        `${baseUrl}/legal-test-page-does-not-exist`,
      );
      expect(response?.status()).toBe(404);
      for (const [label, path] of routes)
        await expect(
          page
            .locator("footer")
            .getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("href", path);
      await page.screenshot({
        path: `../.playwright-mcp/legal-404-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });

    test("hides footer and legal links in the OBS scene", async ({ page }) => {
      // A synthetic invalid key mounts the overlay's chrome-hiding effect;
      // mock the stream endpoint so the test never needs a database or real key.
      await page.route("**/api/**", (route) =>
        route.fulfill({
          status: 401,
          json: { error: "Test overlay has no session" },
        }),
      );
      await page.goto(
        `${baseUrl}/single-cat-stream/obs?key=legal-test-no-session`,
      );
      await expect(page.locator("footer")).toBeHidden();
      for (const [label] of routes)
        await expect(
          page
            .locator("footer")
            .getByRole("link", { name: label, exact: true }),
        ).toBeHidden();
    });
  });
}

test("serves legal text without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(baseUrl).origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    for (const [, path, , email] of routes) {
      const response = await page.goto(`${baseUrl}${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toContainText(email);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow",
      );
    }
  } finally {
    await context.close();
  }
});
