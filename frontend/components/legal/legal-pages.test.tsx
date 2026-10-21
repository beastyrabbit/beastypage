import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
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
        expect(
          doc.querySelector('section[aria-label][tabindex="0"]'),
        ).not.toBeNull();
        const discord = Array.from(doc.querySelectorAll("p")).find((p) =>
          p.textContent?.includes("/palette"),
        );
        expect(discord?.textContent).toContain(
          lang === "de" ? "Nachrichten-Kontextmenü" : "message context menu",
        );
        expect(discord?.textContent).toContain(
          lang === "de" ? "andere Personen" : "other people",
        );
        expect(discord?.textContent).toContain(
          lang === "de"
            ? "ohne automatische Ablaufzeit"
            : "no automatic expiry",
        );
        expect(
          discord?.querySelector(`a[href="mailto:${email}"]`),
        ).not.toBeNull();
        expect(discord?.textContent).toContain(
          lang === "de"
            ? "Rechtsgrundlage ist wie für die anderen Bot-Inhalte Art. 6 Abs. 1 lit. b DSGVO. Soweit das Bild andere Personen zeigt, ist Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der Bereitstellung der angeforderten Palette."
            : "As with other bot content, the legal basis is Art. 6(1)(b) GDPR. Where the image shows other people, the legal basis is Art. 6(1)(f) GDPR, with the legitimate interest of providing the requested palette.",
        );
        const imageMetadata = Array.from(doc.querySelectorAll("p")).find((p) =>
          p.textContent?.includes("EXIF"),
        );
        expect(imageMetadata?.textContent).toContain(
          lang === "de"
            ? "Hochgeladene sowie über den Discord-Befehl /palette gespeicherte Bilder werden unverändert einschließlich eingebetteter Metadaten wie EXIF gespeichert."
            : "Uploaded images and images stored through the Discord /palette command are stored unchanged, including embedded metadata such as EXIF.",
        );
        const clerk = doc.querySelectorAll("main > section")[6];
        expect(clerk.textContent).not.toMatch(
          /Kontoeinstellungen|account settings/,
        );
        expect(clerk.textContent).toContain(
          lang === "de"
            ? "Dann werden sowohl das Clerk-Konto als auch die bei BeastyPage gespeicherten Daten gelöscht."
            : "Both the Clerk account and the data stored in BeastyPage are then deleted.",
        );
        expect(clerk.querySelector(`a[href="mailto:${email}"]`)).not.toBeNull();
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
  for (const link of links.slice(0, 2)) expect(link.lang).toBe("de");
});

it("keeps the normal error inside the layout and supplies legal links for global errors", () => {
  const retry = vi.fn();
  const html = renderToStaticMarkup(
    <ErrorPage error={new Error("private error")} retry={retry} />,
  );
  expect(html).toContain("Try again");
  expect(html).not.toMatch(/<html|<body|private error/);
  const globalHtml = renderToStaticMarkup(
    <GlobalError error={new Error("private error")} retry={retry} />,
  );
  expect(globalHtml).toContain('<html lang="en">');
  expect(globalHtml).not.toContain("private error");
  for (const { route } of pages)
    expect(globalHtml).toContain(`href="${route}"`);
  const doc = new DOMParser().parseFromString(globalHtml, "text/html");
  for (const path of ["/impressum", "/datenschutz"])
    expect(doc.querySelector(`a[href="${path}"]`)?.getAttribute("lang")).toBe(
      "de",
    );
});

it.each([ErrorPage, GlobalError])(
  "retries when the error button is clicked (%#)",
  async (Page) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // GlobalError owns the document; render each boundary in a fresh document.
    const doc = document.implementation.createHTMLDocument();
    const root = createRoot(Page === GlobalError ? doc : doc.body);
    const retry = vi.fn();
    try {
      await act(async () =>
        root.render(<Page error={new Error("test")} retry={retry} />),
      );
      await act(async () => doc.querySelector("button")?.click());
      expect(retry).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
