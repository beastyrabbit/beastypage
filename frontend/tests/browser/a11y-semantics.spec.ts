import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

function fixtureUrl(view: string) {
  const url = new URL("a11y-semantics.html", process.env.BROWSER_FIXTURE_URL);
  url.searchParams.set("view", view);
  return url.href;
}

async function verifyModal(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty("tagName", "DIALOG");
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
    true,
  );
  expect(await dialog.ariaSnapshot()).toContain("dialog");
  await expect(
    dialog.locator("button:not([tabindex='-1'])").first(),
  ).toBeFocused();
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press(key);
      await expect(
        page.getByRole("button", { name: "Before fixture", exact: true }),
      ).not.toBeFocused();
      await expect(
        page.getByRole("button", { name: "After fixture", exact: true }),
      ).not.toBeFocused();
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px viewport`, () => {
    test.use({ viewport });

    test("swatch selection and copying are independent native buttons", async ({
      page,
    }) => {
      await page.goto(fixtureUrl("controls"));
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async () => {} },
        }),
      );
      const swatch = page.getByRole("button", {
        name: "Color 1: #ff8800",
        exact: true,
      });
      await swatch.press("Enter");
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
      await swatch.press("Space");
      await expect(swatch).toHaveAttribute("aria-pressed", "false");
      await swatch.click({ position: { x: 90, y: 40 } });
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
      for (const name of ["#FF8800", "255, 136, 0", "32°, 100%, 50%"]) {
        await page.getByRole("button", { name, exact: true }).press("Enter");
        await expect(swatch).toHaveAttribute("aria-pressed", "true");
      }
      expect(
        await page
          .locator("button button, button input, [role=button]")
          .count(),
      ).toBe(0);
    });

    test("palette trigger, removal, Escape and outside click preserve focus", async ({
      page,
    }) => {
      await page.goto(fixtureUrl("controls"));
      const trigger = page.getByRole("button", { name: /^Select palettes:/ });
      await trigger.press("Space");
      const search = page.getByPlaceholder("Search palettes...");
      await expect(search).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.press("Enter");
      await expect(search).toBeFocused();
      await page.getByRole("button", { name: "Before fixture" }).click();
      await expect(search).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Before fixture" }),
      ).toBeFocused();
      const remove = page.getByRole("button", { name: /^Remove .+ palette$/ });
      await remove.press("Space");
      await expect(remove).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("upload opens the chooser with click, Enter and Space, and accepts a file", async ({
      page,
    }) => {
      await page.goto(fixtureUrl("controls"));
      const upload = page.getByRole("button", {
        name: "Upload image",
        exact: true,
      });
      for (const key of ["Enter", "Space", "click"]) {
        const chooserPromise = page.waitForEvent("filechooser");
        if (key === "click") await upload.click();
        else await upload.press(key);
        const chooser = await chooserPromise;
        await chooser.setFiles(resolve("public/sprites/fademask.png"));
        await expect(
          page.getByRole("status", { name: "Loaded image" }),
        ).toHaveText("fademask.png");
      }
    });

    for (const { view, triggerName, dialogName } of [
      {
        view: "batch",
        triggerName: "Open preview for Sunfur",
        dialogName: "Sunfur",
      },
      {
        view: "founding",
        triggerName: "Select founding couple",
        dialogName: "Select Founding Couple",
      },
      {
        view: "evolution",
        triggerName: "Preview Sunfur",
        dialogName: "Sunfur",
      },
    ]) {
      test(`${view} modal supports keyboard, Escape, outside click and focus return`, async ({
        page,
      }) => {
        await page.goto(fixtureUrl(view));
        const trigger = page.getByRole("button", {
          name: triggerName,
          exact: true,
        });
        const dialog = page.getByRole("dialog", {
          name: dialogName,
          exact: true,
        });
        await trigger.press("Enter");
        await verifyModal(page, dialog);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.press("Space");
        await expect(dialog).toBeVisible();
        await dialog.click({ position: { x: 2, y: 2 } });
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await dialog
          .locator("button:not([tabindex='-1'])")
          .first()
          .press("Space");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }

    test("founding couple selection remains usable with the keyboard", async ({
      page,
    }) => {
      await page.goto(fixtureUrl("founding"));
      await page
        .getByRole("button", { name: "Select founding couple", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Sunfur" }).press("Enter");
      await dialog.getByRole("button", { name: "Moonfur" }).press("Space");
      await dialog.getByRole("button", { name: "Create Tree" }).press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText("Couple selected", { exact: true }),
      ).toBeVisible();
    });

    test("single cat timing and sprite dialogs restore focus and dismiss correctly", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(fixtureUrl("single"));
      await page.evaluate(() => {
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = ((
          handler: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) =>
          schedule(
            handler,
            delay === 2400 ? delay : Math.min(delay ?? 0, 10),
            ...args,
          )) as typeof window.setTimeout;
      });
      await page
        .getByRole("button", { name: "Generate Cat", exact: true })
        .click();
      for (const { triggerName, dialogName } of [
        { triggerName: "Adjust Timing Settings", dialogName: "Spin Timing" },
        { triggerName: "View Sprite Gallery", dialogName: "Sprite Gallery" },
      ]) {
        const trigger = page.getByRole("button", {
          name: triggerName,
          exact: true,
        });
        const dialog = page.getByRole("dialog", {
          name: dialogName,
          exact: true,
        });
        await expect(trigger).toBeEnabled({ timeout: 90_000 });
        await trigger.press("Enter");
        await verifyModal(page, dialog);
        if (dialogName === "Sprite Gallery") {
          await page.evaluate(() =>
            Object.defineProperty(navigator, "clipboard", {
              configurable: true,
              value: { write: async () => {} },
            }),
          );
          await dialog
            .getByRole("button", { name: /Copy .* at 120 by 120 pixels/ })
            .first()
            .click();
          const confirmation = dialog.getByText(/^Copied .* \(120×120\)!$/);
          await expect(confirmation).toBeVisible();
          expect(
            await confirmation.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              );
              return hit === element || element.contains(hit);
            }),
          ).toBe(true);
          await page.screenshot({
            path: `../.playwright-mcp/a11y-${viewport.width}-gallery-copy.png`,
          });
        }
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.press("Space");
        await dialog.click({ position: { x: 2, y: 2 } });
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await dialog
          .locator("button:not([tabindex='-1'])")
          .first()
          .press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    });

    test("legacy adoption detail and nested sprite gallery use native modal focus", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.goto(fixtureUrl("adoption"));
      // Skip animation delays while exercising the real generation/removal flow.
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
          )) as typeof window.setTimeout;
      });
      await page.getByRole("button", { name: "Fast", exact: true }).click();
      await page
        .getByRole("button", { name: "Generate Adoption", exact: true })
        .click();
      const cat = page.locator(".cat-card .cat-canvas-wrapper").first();
      await expect(cat).toBeVisible({ timeout: 120_000 });
      const removals = (await page.locator(".cat-card").count()) - 10;
      for (let index = 0; index < removals; index++) {
        await page
          .locator(".removal-mode .cat-card:not(.force-overlay) .cat-remove")
          .first()
          .click({ force: true });
        await expect(page.locator("#catGrid")).not.toHaveClass(/removal-mode/);
      }
      await expect(page.locator("#removalTip")).toHaveText(
        "Generation complete.",
        {
          timeout: 120_000,
        },
      );
      await cat.click({ position: { x: 5, y: 5 } });
      const detail = page.locator("#catDetailOverlay");
      await verifyModal(page, detail);
      const galleryTrigger = detail.getByRole("button", {
        name: "View sprite gallery",
      });
      await galleryTrigger.press("Enter");
      const gallery = page.getByRole("dialog", {
        name: "Sprite Gallery",
        exact: true,
      });
      await verifyModal(page, gallery);
      await page.keyboard.press("Escape");
      await expect(gallery).not.toBeVisible();
      await expect(galleryTrigger).toBeFocused();
      await galleryTrigger.press("Space");
      await gallery
        .locator(".overlay-backdrop")
        .click({ position: { x: 2, y: 2 } });
      await expect(gallery).not.toBeVisible();
      await expect(galleryTrigger).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(detail).not.toBeVisible();
      await cat.click({ position: { x: 5, y: 5 } });
      await detail
        .locator(".overlay-backdrop")
        .click({ position: { x: 2, y: 2 } });
      await expect(detail).not.toBeVisible();
    });
  });
}
