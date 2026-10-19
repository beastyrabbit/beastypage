import { expect, type Locator, test } from "@playwright/test";

async function expectInsideViewport(element: Locator) {
  const bounds = await element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
      width: innerWidth,
      height: innerHeight,
      reachable: node.contains(
        document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        ),
      ),
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.reachable).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 390, height: 600 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("first, middle and last card keep Close reachable and retain modal focus", async ({
      page,
    }) => {
      await page.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue()
          : route.abort(),
      );
      const url = new URL("index.html", process.env.BROWSER_FIXTURE_URL);
      url.searchParams.set("view", "catdex");
      url.searchParams.set("detailRegression", "1");
      await page.goto(url.href);
      await page.getByRole("button", { name: "Load more cards" }).click();
      await expect(page.locator("article")).toHaveCount(69);

      for (const card of [1, 35, 69]) {
        const trigger = page.getByRole("button", {
          name: `Open Detail cat ${card}`,
          exact: true,
        });
        if (card === 1) {
          await page.evaluate(() => scrollTo(0, 0));
          await trigger.evaluate((node) => node.focus({ preventScroll: true }));
          await trigger.press("Enter");
        } else {
          await trigger.click();
        }
        const scrollBefore = await page.evaluate(() => scrollY);
        const close = page.getByRole("button", { name: "Close", exact: true });
        const panel = close.locator("..");
        await panel
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.decode());
        await page.screenshot({
          path: `../.playwright-mcp/catdex-detail-${viewport.width}x${viewport.height}-${card}.png`,
        });
        // This fails on the old implementation once the natural image height is known.
        await expectInsideViewport(close);
        await expectInsideViewport(panel);
        const dialog = page.getByRole("dialog", {
          name: `Detail cat ${card}`,
          exact: true,
        });
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(
          true,
        );
        await expect(close).toBeFocused();
        await dialog.click({ position: { x: 2, y: 2 } });
        await expect(dialog).toBeVisible();
        for (const key of ["Shift+Tab", "Tab", "Tab", "Tab"]) {
          await page.keyboard.press(key);
          expect(
            await dialog.evaluate(
              (node) =>
                document.activeElement === document.body ||
                node.contains(document.activeElement),
            ),
          ).toBe(true);
        }
        const content = panel.locator(".overflow-y-auto");
        await content.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        if (viewport.height <= 800) {
          expect(
            await content.evaluate((node) => node.scrollTop),
          ).toBeGreaterThan(0);
        }
        await expect(
          dialog.getByRole("button", { name: "Custom art", exact: true }),
        ).toBeInViewport();
        await expectInsideViewport(close);
        await page.mouse.move(viewport.width - 4, viewport.height / 2);
        await page.mouse.wheel(0, 500);
        expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
        await trigger.press("Enter");
        await expect(close).toBeFocused();
        await close.press("Space");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
      await page.screenshot({
        path: `../.playwright-mcp/catdex-grid-${viewport.width}x${viewport.height}.png`,
      });
    });
  });
}
