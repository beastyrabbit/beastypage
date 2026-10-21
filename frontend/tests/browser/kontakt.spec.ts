import { expect, type Page, type Route, test } from "@playwright/test";

// Run against a local production server, never a deployed site or live Resend.
const baseUrl = process.env.CONTACT_TEST_BASE_URL ?? "";
test.skip(
  !baseUrl,
  "Set CONTACT_TEST_BASE_URL to the local Next.js production server.",
);

async function fillContactForm(page: Page) {
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Erika Muster");
  await page
    .getByRole("textbox", { name: "E-Mail / Email", exact: true })
    .fill("erika@example.org");
  await page
    .getByRole("textbox", { name: "Nachricht / Message", exact: true })
    .fill("Ich habe eine Frage zur Webseite.");
}

for (const width of [1280, 390]) {
  test.describe(`Kontakt at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page }) => {
      // Keep third-party scripts, analytics and Clerk requests off the network.
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === new URL(baseUrl).origin
          ? route.continue()
          : route.abort();
      });
    });

    test("renders noindex, fits the viewport, and confirms a mocked successful send", async ({
      page,
    }) => {
      const pending = new Promise<Route>((resolve) => {
        void page.route("**/api/kontakt", resolve);
      });
      await page.goto(`${baseUrl}/kontakt`);
      await expect(
        page.getByRole("heading", { name: "Kontakt", exact: true }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.locator("main")).toHaveAttribute("lang", "de");
      await expect(
        page.getByText(
          "Send your enquiry using this form. All fields are required.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }),
      ).not.toHaveAttribute("action");
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }),
      ).toHaveAttribute("method", "post");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const honeypot = page.locator('input[name="website"]');
      await expect(honeypot).toHaveAttribute("tabindex", "-1");
      await expect(honeypot).toHaveAttribute("autocomplete", "off");
      await expect(honeypot.locator("..")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      await fillContactForm(page);
      await page
        .getByRole("button", { name: "Nachricht senden / Send message" })
        .click();
      const route = await pending;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        name: "Erika Muster",
        email: "erika@example.org",
        message: "Ich habe eine Frage zur Webseite.",
        website: "",
      });
      await expect(
        page.getByRole("button", { name: "Wird gesendet … / Sending …" }),
      ).toBeDisabled();
      await route.fulfill({ json: { success: true } });
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Danke, Ihre Nachricht wurde gesendet." }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Thank you, your message has been sent. You will get a reply by email.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Ihre Angaben (Name, E-Mail-Adresse, Nachricht)", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Your details (name, email address, message)", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Ihre Angaben (Name, E-Mail-Adresse, Nachricht)", {
          exact: false,
        }),
      ).toContainText("Resend (USA)");
      await expect(
        page.getByText("Your details (name, email address, message)", {
          exact: false,
        }),
      ).toContainText("Fastmail (Australia)");
      await page.screenshot({
        path: `../.playwright-mcp/kontakt-success-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });

    test("keeps input after an error and allows retry", async ({ page }) => {
      let attempt = 0;
      await page.route("**/api/kontakt", (route) => {
        attempt++;
        return route.fulfill(
          attempt === 1
            ? {
                status: 429,
                json: {
                  error:
                    "Zu viele Anfragen. Bitte versuchen Sie es in 10 Minuten erneut.\nToo many requests. Please try again in 10 minutes.",
                },
              }
            : { json: { success: true } },
        );
      });
      await page.goto(`${baseUrl}/kontakt`);
      await fillContactForm(page);
      await page
        .getByRole("button", { name: "Nachricht senden / Send message" })
        .click();
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }).getByRole("alert"),
      ).toContainText("Zu viele Anfragen");
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }).getByRole("alert"),
      ).toContainText("Too many requests");
      await expect(
        page.getByRole("textbox", { name: "Name", exact: true }),
      ).toHaveValue("Erika Muster");
      await expect(
        page.getByRole("textbox", { name: "E-Mail / Email", exact: true }),
      ).toHaveValue("erika@example.org");
      await expect(
        page.getByRole("textbox", { name: "Nachricht / Message", exact: true }),
      ).toHaveValue("Ich habe eine Frage zur Webseite.");
      await expect(
        page.getByRole("button", { name: "Nachricht senden / Send message" }),
      ).toBeEnabled();
      await page.screenshot({
        path: `../.playwright-mcp/kontakt-error-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Nachricht senden / Send message" })
        .click();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Danke, Ihre Nachricht wurde gesendet." }),
      ).toBeVisible();
    });

    test("shows the fallback contact address on a network error", async ({
      page,
    }) => {
      await page.route("**/api/kontakt", (route) => route.abort());
      await page.goto(`${baseUrl}/kontakt`);
      await fillContactForm(page);
      await page
        .getByRole("button", { name: "Nachricht senden / Send message" })
        .click();
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }).getByRole("alert"),
      ).toContainText("impressum-beastyrabbit@heerlab.com");
      await expect(
        page.getByRole("form", { name: "Kontaktformular" }).getByRole("alert"),
      ).toContainText("Your message could not be sent.");
      await expect(
        page.getByRole("textbox", { name: "Name", exact: true }),
      ).toHaveValue("Erika Muster");
      await expect(
        page.getByRole("button", { name: "Nachricht senden / Send message" }),
      ).toBeEnabled();
    });

    for (const [query, source] of [
      ["from=moddrop", "moddrop"],
      ["from=evil", undefined],
      ["from=MODDROP", undefined],
      ["from=moddrop&from=evil", undefined],
      ["from=moddrop%0D%0ABcc%3A%20x", undefined],
    ] as const) {
      test(`validates the source parameter: ${query}`, async ({ page }) => {
        const pending = new Promise<Route>((resolve) => {
          void page.route("**/api/kontakt", resolve);
        });
        await page.goto(`${baseUrl}/kontakt?${query}`);
        await fillContactForm(page);
        await page
          .getByRole("button", { name: "Nachricht senden / Send message" })
          .click();
        const route = await pending;
        expect(route.request().postDataJSON()).toEqual({
          name: "Erika Muster",
          email: "erika@example.org",
          message: "Ich habe eine Frage zur Webseite.",
          website: "",
          ...(source ? { source } : {}),
        });
        await route.fulfill({ json: { success: true } });
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "Danke, Ihre Nachricht wurde gesendet." }),
        ).toBeVisible();
      });
    }
  });
}

test("offers the site-specific email address without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(baseUrl).origin
        ? route.continue()
        : route.abort(),
    );
    await page.goto(`${baseUrl}/kontakt`);
    await expect(page.locator("noscript p")).toContainText(
      "Dieses Formular benötigt JavaScript.",
    );
    await expect(page.locator("noscript p")).toContainText(
      "This form requires JavaScript.",
    );
    await expect(page.locator("noscript p")).toContainText(
      "impressum-beastyrabbit@heerlab.com",
    );
    await expect(page.locator("noscript p")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nachricht senden / Send message" }),
    ).toBeDisabled();
  } finally {
    await context.close();
  }
});

for (const submission of ["submit", "requestSubmit"] as const) {
  test(`forced native ${submission} without JavaScript keeps fields out of the URL`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === new URL(baseUrl).origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${baseUrl}/kontakt`);
      await expect(
        page.getByRole("button", { name: "Nachricht senden / Send message" }),
      ).toBeDisabled();
      await fillContactForm(page);
      const navigation = page.waitForResponse(
        (response) =>
          response.request().isNavigationRequest() &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("form", { name: "Kontaktformular" })
        .evaluate((form: HTMLFormElement, method) => {
          form[method]();
        }, submission);
      const response = await navigation;
      await response.finished();
      await page.waitForLoadState("load");
      expect(response.request().method()).toBe("POST");
      expect(
        new URLSearchParams(response.request().postData() ?? "").get("email"),
      ).toBe("erika@example.org");
      expect(response.url()).toBe(`${baseUrl}/kontakt`);
      expect(page.url()).toBe(`${baseUrl}/kontakt`);
      for (const field of ["name", "email", "message"])
        expect(new URL(page.url()).searchParams.has(field)).toBe(false);
    } finally {
      await context.close();
    }
  });
}
