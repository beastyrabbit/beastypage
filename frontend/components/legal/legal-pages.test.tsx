import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DatenschutzPage, {
  metadata as datenschutzMetadata,
} from "@/app/datenschutz/page";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import ImpressumPage, {
  metadata as impressumMetadata,
} from "@/app/impressum/page";
import LegalNoticePage, {
  metadata as noticeMetadata,
} from "@/app/legal-notice/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import { SiteFooter } from "@/components/site-footer";
import { config, routeRequest } from "@/proxy";

const pages = [
  {
    route: "/impressum",
    Page: ImpressumPage,
    metadata: impressumMetadata,
    lang: "de",
    email: "impressum-beastyrabbit@heerlab.com",
    counterpart: "/legal-notice",
    related: "/datenschutz",
    privacy: false,
  },
  {
    route: "/legal-notice",
    Page: LegalNoticePage,
    metadata: noticeMetadata,
    lang: "en",
    email: "impressum-beastyrabbit@heerlab.com",
    counterpart: "/impressum",
    related: "/privacy",
    privacy: false,
  },
  {
    route: "/datenschutz",
    Page: DatenschutzPage,
    metadata: datenschutzMetadata,
    lang: "de",
    email: "datenschutz-beastyrabbit@heerlab.com",
    counterpart: "/privacy",
    related: "/impressum",
    privacy: true,
  },
  {
    route: "/privacy",
    Page: PrivacyPage,
    metadata: privacyMetadata,
    lang: "en",
    email: "datenschutz-beastyrabbit@heerlab.com",
    counterpart: "/datenschutz",
    related: "/legal-notice",
    privacy: true,
  },
] as const;

describe.each(pages)(
  "$route",
  ({ Page, metadata, lang, email, counterpart, related, privacy, route }) => {
    it("renders public operator details, contact links, language and noindex metadata", () => {
      const html = renderToStaticMarkup(<Page />);
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.querySelector("main")?.lang).toBe(lang);
      for (const value of [
        "Tobias Heer",
        "c/o Impressumservice Dein-Impressum",
        "Stettiner Str. 41",
        "35410 Hungen",
        email,
      ])
        expect(doc.body.textContent).toContain(value);
      expect(doc.querySelector(`a[href="mailto:${email}"]`)).not.toBeNull();
      expect(
        doc.querySelector(
          'a[href="https://beastyrabbit.com/kontakt?from=beastyrabbit"]',
        ),
      ).not.toBeNull();
      expect(doc.querySelector(`a[href="${counterpart}"]`)).not.toBeNull();
      expect(doc.querySelector(`a[href="${related}"]`)).not.toBeNull();
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(html).not.toMatch(
        /\[\[|<!--|impressum@heerlab\.com|datenschutz@heerlab\.com|Hetzner|thecolorapi/i,
      );
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      expect(doc.querySelector("h1")?.textContent).not.toBe("");
      if (privacy) {
        expect(
          Array.from(doc.querySelectorAll("h2"), (h) =>
            Number(h.textContent?.split(".")[0]),
          ),
        ).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
        expect(doc.querySelectorAll("h3").length).toBeGreaterThanOrEqual(5);
        expect(doc.querySelectorAll("table tbody tr")).toHaveLength(13);
        for (const key of [
          "catdex-upload:client-key",
          "classic-wheel:client-key",
          "stream-viewer-session:fingerprint",
          "stream-viewer-session:<viewerKey>",
          "beastyrabbit.quick-share.receipts.v1",
          "ancestry-tree-edit:<slug>",
          "beastypage:mapper-edit-token:<slug>",
          "singleCatPlus.variants",
          "pixelator-variants",
          "paletteGenerator.collection",
          lang === "de" ? "ph_<projekt>_posthog" : "ph_<project>_posthog",
          lang === "de" ? "ph_<projekt>_window_id" : "ph_<project>_window_id",
        ])
          expect(doc.body.textContent).toContain(key);
        expect(doc.body.textContent).toContain(
          lang === "de"
            ? "ohne vorherige Einwilligung"
            : "without prior consent",
        );
        const contact = doc.querySelectorAll("main > section")[13];
        const paragraphs = contact.querySelectorAll("p");
        expect(paragraphs[0].textContent).toContain(
          lang === "de"
            ? "bis zu 10 Minuten nach Ihrer letzten Anfrage nur im Arbeitsspeicher gehalten."
            : "held only in memory until 10 minutes after your last request.",
        );
        expect(paragraphs[1].textContent).toContain("?from=");
        expect(paragraphs[2].textContent).toContain("Resend");
        expect(paragraphs[3].textContent).toContain(
          lang === "de" ? "siehe nächster Abschnitt" : "see next section",
        );
        for (const row of doc.querySelectorAll("table tbody tr")) {
          const cells = row.querySelectorAll("td");
          const name = cells[0].textContent ?? "";
          if (
            name.includes("(localStorage)") &&
            !name.includes("__clerk_environment")
          ) {
            expect(cells[3].textContent).toBe(
              lang === "de"
                ? "Bis Sie die Browserdaten löschen"
                : "Until you delete browser data",
            );
          }
        }
        const posthog = doc.querySelectorAll("table tbody tr")[2];
        expect(posthog.querySelectorAll("td")[4].textContent).toBe(
          lang === "de"
            ? "Einwilligungsbedürftig nach § 25 Abs. 1 TDDDG; derzeit ohne Einwilligung gesetzt (siehe Abschnitt 9)"
            : "Requires consent under Section 25(1) TDDDG; currently set without consent (see section 9)",
        );
        if (lang === "en")
          expect(posthog.textContent).not.toContain("<projekt>");
      } else {
        const contact = doc.querySelectorAll("main > section")[1];
        expect(contact.querySelector('a[href^="mailto:"] + br')).not.toBeNull();
      }
    });

    it("stays public under maintenance mode and is outside Clerk's proxy matcher", () => {
      vi.stubEnv("MAINTENANCE_MODE", "1");
      try {
        for (const method of ["GET", "HEAD"])
          expect(
            routeRequest(
              new NextRequest(`http://localhost${route}`, { method }),
            ).status,
          ).toBe(200);
        expect(unstable_doesMiddlewareMatch({ config, url: route })).toBe(
          false,
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });
  },
);

it("groups all four internal footer links before the external links", () => {
  const html = renderToStaticMarkup(<SiteFooter />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("a"));
  expect(
    links
      .slice(0, 4)
      .map((link) => [
        link.textContent,
        link.getAttribute("href"),
        link.getAttribute("target"),
      ]),
  ).toEqual([
    ["Impressum", "/impressum", null],
    ["Datenschutz", "/datenschutz", null],
    ["Legal notice", "/legal-notice", null],
    ["Privacy", "/privacy", null],
  ]);
});

it("keeps the normal error inside the layout and supplies legal links for global errors", () => {
  const reset = vi.fn();
  const html = renderToStaticMarkup(
    <ErrorPage error={new Error("private error")} reset={reset} />,
  );
  expect(html).toContain("Try again");
  expect(html).not.toMatch(/<html|<body|private error/);
  const globalHtml = renderToStaticMarkup(
    <GlobalError error={new Error("private error")} reset={reset} />,
  );
  expect(globalHtml).toContain('<html lang="en">');
  expect(globalHtml).not.toContain("private error");
  for (const { route } of pages)
    expect(globalHtml).toContain(`href="${route}"`);
});
