import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  isDeclaredStorageKey,
  STORAGE_INVENTORY,
} from "../../lib/telemetry/storage-inventory";

const fixtures = resolve(process.cwd(), "tests/telemetry/fixtures");
const screenshots = resolve(process.cwd(), "../.playwright-mcp");
const forbiddenStorageKey = /posthog|ph_|window_id|__ph|bubu|umami|sentry/i;

async function stubServices(page: Page) {
  // Always sample the recorder in this isolated test, including its storage behavior.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const sends: { type: string; payload: Record<string, unknown> }[] = [];
  const records: { payload: { events: { type: number }[] } }[] = [];
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
    // Existing OBS themes request optional font CSS; keep this test offline too.
    if (url.hostname === "fonts.googleapis.com")
      return route.fulfill({ contentType: "text/css", body: "" });
    if (
      url.hostname === "localhost" &&
      url.pathname.includes("/api/1/envelope")
    ) {
      envelopes.push(route.request().postData() ?? "");
      return route.fulfill({ json: {} });
    }
    if (url.hostname === "localhost" && url.pathname === "/api/users/viewer")
      return route.fulfill({ json: null });
    if (url.hostname === "localhost" && url.pathname === "/api/cat-stream")
      return route.fulfill({ json: null });
    if (
      url.hostname === "localhost" &&
      url.pathname === "/api/live/cat-stream/fixture"
    )
      return route.fulfill({
        contentType: "text/event-stream",
        body: "data: null\n\n",
      });
    if (url.hostname === "localhost") return route.continue();
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
  expect(
    [
      ...cookies.map((cookie) => cookie.name),
      ...storage.local,
      ...storage.session,
    ].every((key) => !forbiddenStorageKey.test(key)),
  ).toBe(true);
  return { cookies: cookies.map((cookie) => cookie.name), ...storage };
}

type StorageAuditWindow = Window & { storageWriteKeys: string[] };

async function auditStorage(page: Page, path: string) {
  const storage = await assertStorage(page);
  const writes = await page.evaluate(
    () => (window as unknown as StorageAuditWindow).storageWriteKeys,
  );
  const allowed = STORAGE_INVENTORY.filter(
    (item) =>
      item.group !== "features" ||
      (path === "/palette-generator" &&
        item.name === "paletteGenerator.collection"),
  );
  for (const key of [
    ...storage.cookies,
    ...storage.local,
    ...storage.session,
    ...writes,
  ]) {
    expect(
      allowed.some((item) => new RegExp(item.pattern).test(key)),
      key,
    ).toBe(true);
    expect(key).not.toMatch(forbiddenStorageKey);
  }
  return { ...storage, writes: [...new Set(writes)].sort() };
}

async function assertEqualConsentButtons(page: Page) {
  const banner = page.getByRole("dialog", {
    name: "Your privacy, your choice",
  });
  const buttons = ["Necessary only", "Accept analytics"].map((name) =>
    banner.getByRole("button", { name, exact: true }),
  );
  const appearances = [];
  for (const button of buttons) {
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport({ ratio: 1 });
    appearances.push(
      await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          classes: element.className,
          parent: element.parentElement?.className,
          width: rect.width,
          height: rect.height,
          background: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          padding: style.padding,
        };
      }),
    );
  }
  expect(appearances[0]).toEqual(appearances[1]);
  expect(await page.evaluate(() => scrollY)).toBe(0);
}

for (const width of [1440, 390]) {
  for (const path of ["/", "/projects", "/palette-generator"]) {
    test(`storage consent audit on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const { umamiRequests, envelopes, external } = await stubServices(page);
      await page.addInitScript(() => {
        const keys: string[] = [];
        (window as unknown as StorageAuditWindow).storageWriteKeys = keys;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          keys.push(key);
          return original.call(this, key, value);
        };
      });
      if (path === "/") {
        // Necessary synthetic marker skips Clerk's server-side dev handshake.
        // It is not an authentication token, and the fixture stays signed out.
        await page.context().addCookies([
          {
            name: "__clerk_db_jwt",
            value: "offline-test-browser",
            url: "http://localhost:4319",
          },
        ]);
      }
      const prefix = `storage-${path.slice(1) || "home"}-${width}`;
      await mkdir(screenshots, { recursive: true });
      const capture = async (state: string, route = path) => {
        const storage = await auditStorage(page, path);
        await page.screenshot({
          path: resolve(screenshots, `${prefix}-${state}.png`),
          animations: "disabled",
        });
        console.log(
          `[storage-audit] ${JSON.stringify({ path, width, state, route, ...storage })}`,
        );
        return storage;
      };
      const assertNoTelemetry = async () => {
        // Observe beyond deferred error SDK initialization and the tracker's 300ms debounce.
        await page.waitForTimeout(1000); // NOSONAR: Bounded observation window for forbidden asynchronous requests.
        await expect(
          page.locator('script[src*="umami.telemetry.test"]'),
        ).toHaveCount(0);
        expect(umamiRequests).toEqual([]);
        expect(envelopes).toEqual([]);
      };

      await page.goto(path);
      await assertEqualConsentButtons(page);
      await assertNoTelemetry();
      const before = await capture("before-choice");
      expect([
        ...before.cookies,
        ...before.local,
        ...before.session,
        ...before.writes,
      ]).not.toContain("cc_cookie");
      await page
        .getByRole("button", { name: "Necessary only", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Your privacy, your choice" }),
      ).toBeHidden();
      await assertNoTelemetry();
      const rejected = await capture("necessary-only");
      expect(rejected).toEqual({
        ...before,
        cookies: [...before.cookies, "cc_cookie"],
      });

      // A document marker proves the link used client navigation rather than a reload.
      await page.evaluate(() => {
        document.documentElement.dataset.storageAudit = "same-document";
      });
      const destination =
        path === "/projects" ? "/projects/tools" : "/projects";
      if (width === 390 && destination === "/projects")
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page.locator(`a[href="${destination}"]:visible`).first().click();
      await expect(page).toHaveURL(destination);
      await expect(page.locator("html")).toHaveAttribute(
        "data-storage-audit",
        "same-document",
      );
      await assertNoTelemetry();
      const navigated = await capture("necessary-navigation", destination);
      expect(navigated).toEqual(rejected);

      // Return to the audited route with the rejection still stored, then opt in.
      await page.goto(path);
      await page
        .getByRole("button", { name: "Cookie settings", exact: true })
        .last()
        .click();
      await page
        .getByRole("dialog", { name: "Cookie and storage settings" })
        .getByRole("button", { name: "Accept analytics", exact: true })
        .click();
      await expect.poll(() => umamiRequests.includes("/api/send")).toBe(true);
      await expect.poll(() => umamiRequests.includes("/api/record")).toBe(true);
      const accepted = await capture("accept-analytics");
      expect(accepted).toEqual(rejected);
      expect(envelopes).toEqual([]);
      expect(external).toEqual([]);
      await writeFile(
        resolve(screenshots, `${prefix}.json`),
        JSON.stringify(
          {
            path,
            width,
            before,
            rejected,
            navigated,
            accepted,
          },
          null,
          2,
        ),
      );
    });
  }
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
  await expect(page.locator('script[src*="umami.telemetry.test"]')).toHaveCount(
    0,
  );
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
  expect(error).toContain('"infer_ip":"never"');
  expect(error).not.toContain('"ip_address"');
  expect(error).toContain('"public_key":"public"');
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

  // Inert DOM attributes exercise the recorder transport without media requests.
  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "public-media-probe";
    probe.setAttribute(
      "srcset",
      "/safe.png 1x, data:image/png;base64,private-inline-bytes 2x",
    );
    probe.setAttribute("poster", "blob:https://site.test/private-blob");
    probe.setAttribute("src", "/i/private-probe-share");
    document.body.append(probe);
  });
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
  await expect
    .poll(() => JSON.stringify(records))
    .toContain("public-media-probe");
  await page.evaluate(async () => {
    const probe = document.getElementById("public-media-probe");
    probe?.setAttribute("data-probe", "mutation-probe");
    probe?.setAttribute(
      "srcset",
      "data:image/png;base64,private-mutation-bytes 1x",
    );
    probe?.setAttribute("href", "/i/private-mutation-share/0");
    await new Promise(requestAnimationFrame);
    window.dispatchEvent(new Event("pagehide"));
  });
  await expect.poll(() => JSON.stringify(records)).toContain("mutation-probe");
  const recordedBodies = JSON.stringify(records);
  expect(recordedBodies).not.toContain("data:image");
  expect(recordedBodies).not.toContain("blob:");
  expect(recordedBodies).not.toMatch(/\/i\/(?!\[Filtered\])/);
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
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("dialog", { name: "Cookie and storage settings" })
      .getByRole("button", { name: "Necessary only", exact: true })
      .click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Cookie settings", exact: true }).last(),
  ).toBeVisible();
  await expect(page.locator('script[src*="umami.telemetry.test"]')).toHaveCount(
    0,
  );
  const countAfterWithdrawal = sends.length;
  await page.getByRole("link", { name: "Personal", exact: true }).click();
  await page.waitForTimeout(400); // NOSONAR: Observe the fixture's 300ms pageview debounce after withdrawal to prove navigation sends no request.
  expect(sends).toHaveLength(countAfterWithdrawal);
  await assertStorage(page);
  expect(external).toEqual([]);
});

test("OBS sources skip consent and analytics but keep scrubbed error reporting, including after client navigation", async ({
  page,
}) => {
  const { sends, records, umamiRequests, envelopes, external } =
    await stubServices(page);
  await page.goto("/single-cat-stream/obs?key=FAKE");
  // Throw after deferred SDK initialization, exercising actual fetch/XHR and
  // EventSource breadcrumbs/resource spans as well as the overlay request URL.
  await page.evaluate(() =>
    setTimeout(async () => {
      await fetch("/api/cat-stream?key=FAKE");
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve();
        xhr.open("GET", "/api/cat-stream?key=FAKE");
        xhr.send();
      });
      const source = new EventSource("/api/live/cat-stream/fixture?key=FAKE");
      source.addEventListener("message", () => {
        source.close();
        console.log("OBS EventSource /api/live/cat-stream/fixture?key=FAKE");
        throw new Error(
          "OBS telemetry fixture /single-cat-stream/obs?key=FAKE /api/live/cat-stream/fixture?key=FAKE",
        );
      });
    }, 1500),
  );
  await expect
    .poll(
      () => envelopes.some((body) => body.includes("OBS telemetry fixture")),
      { timeout: 20_000 },
    )
    .toBe(true);
  const error =
    envelopes.find((body) => body.includes("OBS telemetry fixture")) ?? "";
  expect(error).toContain('"release":"beastypage@v0.0.0-telemetry-test"');
  expect(error).toContain('"environment":"production"');
  expect(envelopes.join("\n")).not.toContain("FAKE");
  await expect(page.locator("#cc-main")).toHaveCount(0);
  await expect(page.locator('script[src*="umami.telemetry.test"]')).toHaveCount(
    0,
  );
  expect(umamiRequests).toHaveLength(0);
  await assertStorage(page);

  await page.goto("/projects");
  await page
    .getByRole("button", { name: "Accept analytics", exact: true })
    .click();
  await expect.poll(() => sends.length).toBeGreaterThan(0);
  // The recorder sends metadata before its asynchronous initial snapshot.
  // Let both requests finish before measuring sends across the route change.
  await expect
    .poll(() =>
      records.some((record) =>
        record.payload.events.some((event) => event.type === 2),
      ),
    )
    .toBe(true);
  const sendCount = sends.length;
  const recordCount = records.length;
  const requestCount = umamiRequests.length;
  // Next's supported native History API updates usePathname without a full load.
  // The provider must then reload to remove the already-running recorder.
  await Promise.all([
    page.waitForEvent("load"),
    page.evaluate(() =>
      window.history.pushState(null, "", "/single-cat-stream/obs?key=FAKE"),
    ),
  ]);
  await expect(page).toHaveURL(/\/single-cat-stream\/obs\?key=FAKE$/);
  await expect(page.locator("#cc-main")).toHaveCount(0);
  await expect(page.locator('script[src*="umami.telemetry.test"]')).toHaveCount(
    0,
  );
  await page.waitForTimeout(400); // NOSONAR: Observe the fixture's 300ms pageview debounce after OBS reload to prove no delayed analytics requests escape.
  expect(sends).toHaveLength(sendCount);
  expect(records).toHaveLength(recordCount);
  expect(umamiRequests).toHaveLength(requestCount);
  expect(envelopes.join("\n")).not.toContain("FAKE");
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
