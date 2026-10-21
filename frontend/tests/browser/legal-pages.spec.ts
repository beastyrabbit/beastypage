// From frontend/: LEGAL_TEST_BASE_URL=http://localhost:3317 pnpm exec playwright test tests/browser/legal-pages.spec.ts --reporter=line --max-failures=1

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { TELEMETRY_RETENTION } from "../../components/legal/analytics-section";

// Local production server only. No credentials, live providers, or database needed.
const baseUrl = process.env.LEGAL_TEST_BASE_URL ?? "";
// CI has no local production server; run this spec locally with LEGAL_TEST_BASE_URL.
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
        // The telemetry test build uses this synthetic signed-out Clerk client.
        if (url.hostname === "clerk.telemetry.test")
          return url.pathname.endsWith(".js")
            ? route.fulfill({
                path: resolve("tests/telemetry/fixtures/clerk.js"),
                contentType: "application/javascript",
              })
            : route.fulfill({ json: { response: null } });
        if (url.pathname.includes("/api/1/envelope"))
          return route.fulfill({ json: {} });
        if (
          url.origin === new URL(baseUrl).origin &&
          url.pathname === "/api/users/viewer"
        )
          return route.fulfill({ json: null });
        return url.origin === new URL(baseUrl).origin
          ? route.continue()
          : route.abort();
      });
    });

    for (const [label, path, lang, email, counterpart] of routes) {
      test(`follows ${label} from the shared site footer`, async ({ page }) => {
        // The home route runs Clerk middleware. Start on this public route so
        // the synthetic telemetry build needs no server-side Clerk handshake.
        await page.goto(`${baseUrl}/projects`);
        await page
          .getByRole("button", { name: "Necessary only", exact: true })
          .click();
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
          /impressum@heerlab\.com|datenschutz@heerlab\.com|Hetzner|PostHog|\[\[/i,
        );
        if (path === "/datenschutz" || path === "/privacy") {
          await expect(main.locator("h2")).toHaveCount(18);
          await expect(main.locator("table")).toHaveCount(1);
          await expect(main.locator("table tbody tr")).toHaveCount(3);
          await expect(
            main.locator("table tbody tr td:nth-child(2)"),
          ).toHaveText([
            lang === "de"
              ? "Clerk (mit Cloudflare)"
              : "Clerk (with Cloudflare)",
            "BeastyPage",
            "BeastyPage",
          ]);
          await expect(main.locator("table")).toContainText("cc_cookie");
          await expect(main.locator("table")).toContainText("182");
          await expect(
            main.locator("table tbody tr td:first-child"),
          ).toHaveText(
            lang === "de"
              ? [
                  "Clerk-Anmeldecookies (z. B. __client, __client_uat…) und Cloudflare-Bot-Schutz (__cf_bm, _cfuvid) auf clerk.beastyrabbit.com; __clerk_environment (Browser-Speicher)",
                  "cc_cookie (Cookie)",
                  "localStorage und sessionStorage",
                ]
              : [
                  "Clerk sign-in cookies (e.g. __client, __client_uat…) and Cloudflare bot protection (__cf_bm, _cfuvid) on clerk.beastyrabbit.com; __clerk_environment (browser storage)",
                  "cc_cookie (cookie)",
                  "localStorage and sessionStorage",
                ],
          );
          const telemetry = main.locator(":scope > section").nth(8);
          await expect(telemetry.getByRole("heading")).toContainText("Umami");
          await expect(telemetry).toContainText("GlitchTip");
          await expect(telemetry).toContainText(TELEMETRY_RETENTION[lang]);
          await expect(telemetry).not.toContainText(
            /OFFEN|PENDING|Standardaufbewahrung|default retention|PostHog|\d+\s*%|umami\.disabled|sendDefaultPii|Breadcrumbs|IPv[46]|localStorage|sessionStorage|Discord-Bot|Pixelator/i,
          );
          await expect(telemetry).toContainText(
            lang === "de"
              ? "Die IP-Adresse wird aus technischen Gründen übertragen und von GlitchTip nur in gekürzter, anonymisierter Form gespeichert."
              : "The IP address is transmitted for technical reasons, and GlitchTip stores it only in shortened, anonymised form.",
          );
          await telemetry.screenshot({
            path: `../.playwright-mcp/legal-telemetry-${lang}-${width}.png`,
            animations: "disabled",
          });
          await expect(main).toContainText("The Color API");
          await expect(
            main.locator('a[href="https://www.thecolorapi.com"]'),
          ).toHaveText("thecolorapi.com");
          const tableRegion = main.getByRole("region");
          await expect(tableRegion).toHaveAttribute("tabindex", "0");
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
          const cookieSettings = page
            .locator("footer")
            .getByRole("button", { name: "Cookie settings", exact: true });
          await cookieSettings.scrollIntoViewIfNeeded();
          await expect(cookieSettings).toBeVisible();
          await page.screenshot({
            path: `../.playwright-mcp/legal-footer-${lang}-${width}.png`,
            animations: "disabled",
          });
          await cookieSettings.click();
          const preferences = page.getByRole("dialog", {
            name: "Cookie and storage settings",
          });
          await expect(preferences).toBeVisible();
          await preferences
            .getByRole("button", { name: "Necessary storage", exact: true })
            .click();
          await expect(
            preferences.getByText("__cf_bm, _cfuvid", { exact: true }),
          ).toBeVisible();
          await expect(preferences).toContainText(
            "Cookies on clerk.beastyrabbit.com",
          );
          await expect(preferences).toContainText(
            "__cf_bm: about 30 minutes; _cfuvid: session",
          );
          await page.screenshot({
            path: `../.playwright-mcp/legal-preferences-${lang}-${width}.png`,
            animations: "disabled",
          });
          await preferences
            .getByRole("button", { name: "Close settings" })
            .click();
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

    for (const javaScriptEnabled of [true, false]) {
      test.describe(`OBS with JavaScript ${javaScriptEnabled}`, () => {
        test.use({ javaScriptEnabled });
        test("hides footer and legal links with and without a key", async ({
          page,
        }) => {
          // Mock stream APIs so neither path needs a database or real key.
          await page.route("**/api/**", (route) => {
            const path = new URL(route.request().url()).pathname;
            // A signed-out viewer and absent overlay session are nullable results,
            // not errors that should trigger the app's error boundary.
            if (path === "/api/users/viewer" || path === "/api/cat-stream")
              return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "null",
              });
            return route.fulfill({
              status: 401,
              json: { error: "Test overlay has no session" },
            });
          });
          for (const query of ["", "?key=legal-test-no-session"]) {
            await page.goto(`${baseUrl}/single-cat-stream/obs${query}`);
            await expect(page.locator("[data-obs-overlay]")).toHaveCount(1);
            await expect(page.locator("footer")).toHaveCount(1);
            await expect(page.locator("footer")).toBeHidden();
            for (const [label] of routes)
              await expect(
                page
                  .locator("footer")
                  .getByRole("link", { name: label, exact: true }),
              ).toBeHidden();
          }
        });
      });
    }
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
