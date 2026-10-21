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
import { TELEMETRY_RETENTION } from "@/components/legal/analytics-section";
import { SiteFooter } from "@/components/site-footer";
import { isDeclaredStorageKey } from "@/lib/telemetry/storage-inventory";
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
        /\[\[|<!--|impressum@heerlab\.com|datenschutz@heerlab\.com|Hetzner|PostHog/i,
      );
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      expect(doc.querySelector("h1")?.textContent).not.toBe("");

      if (privacy) {
        const sections = Array.from(doc.querySelectorAll("main > section"));
        expect(
          Array.from(doc.querySelectorAll("h2"), (h) =>
            Number(h.textContent?.split(".")[0]),
          ),
        ).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
        expect(sections[2].querySelector("p:last-child")?.textContent).toBe(
          lang === "de"
            ? "Zur Datensicherung werden regelmäßig Sicherungskopien innerhalb der eigenen Infrastruktur erstellt; sie werden nach Ablauf ihrer Aufbewahrungszeit überschrieben."
            : "For data protection against loss, backup copies are created regularly within the controller's own infrastructure; they are overwritten once their retention period expires.",
        );
        expect(sections[3].querySelectorAll("p")).toHaveLength(4);
        expect(sections[3].textContent).toContain(
          lang === "de"
            ? "nach 14 Tagen automatisch gelöscht"
            : "deleted automatically after 14 days",
        );
        expect(sections[3].textContent).toContain(
          lang === "de"
            ? "normalerweise nach höchstens 30 Tagen"
            : "normally deleted after no more than 30 days",
        );
        const account = sections[5];
        expect(account.textContent).toContain(
          lang === "de"
            ? "bis Sie sie löschen oder die Löschung anfordern, höchstens jedoch bis zu 10 Jahre"
            : "until you delete it or request deletion, at most up to 10 years",
        );
        expect(account.textContent).toContain("1–30");
        expect(account.textContent).toContain(
          lang === "de"
            ? "Dateien und IP-Adressen werden nach 30 Tagen gelöscht."
            : "Files and IP addresses are deleted after 30 days.",
        );
        expect(account.textContent).toContain(
          lang === "de" ? "Bild oder seine Metadaten" : "image or its metadata",
        );
        expect(account.textContent).toContain(
          lang === "de" ? "Art. 6 Abs. 1 lit. f DSGVO" : "Art. 6(1)(f) GDPR",
        );
        expect(
          account.querySelector(`a[href="mailto:${email}"]`),
        ).not.toBeNull();
        expect(account.textContent).not.toMatch(/PostgreSQL|EXIF|MiB/);
        const clerk = sections[6];
        expect(clerk.textContent).not.toMatch(
          /Kontoeinstellungen|account settings/,
        );
        expect(clerk.textContent).toContain(
          lang === "de"
            ? "Dann werden sowohl das Clerk-Konto als auch die bei BeastyPage gespeicherten Daten gelöscht."
            : "Both the Clerk account and the data stored in BeastyPage are then deleted.",
        );
        expect(clerk.querySelector(`a[href="mailto:${email}"]`)).not.toBeNull();
        const optional = sections[9];
        expect(optional.querySelector("h2")?.textContent).toContain(
          lang === "de"
            ? "Optionale Funktionen mit externen Abrufen"
            : "Optional features with external requests",
        );
        expect(optional.textContent).toContain("Wikimedia Commons");
        expect(optional.textContent).toContain("The Color API");
        expect(
          optional.querySelector('a[href="https://www.thecolorapi.com"]')
            ?.textContent,
        ).toBe("thecolorapi.com");
        expect(optional.textContent).toContain(
          lang === "de"
            ? "Nähere Angaben zum Betreiber und zu Übermittlungsgarantien liegen derzeit nicht vor."
            : "Further details on the operator and transfer safeguards are not currently available.",
        );
        expect(doc.querySelectorAll("table tbody tr")).toHaveLength(3);
        expect(
          doc.querySelector('section[aria-label][tabindex="0"]'),
        ).not.toBeNull();
        const rows = Array.from(doc.querySelectorAll("table tbody tr"));
        expect(
          rows.map((row) => row.querySelectorAll("td")[1].textContent),
        ).toEqual([
          lang === "de" ? "Clerk (mit Cloudflare)" : "Clerk (with Cloudflare)",
          "BeastyPage",
          "BeastyPage",
        ]);
        expect(rows[0].textContent).toContain("__client_uat");
        expect(rows[0].textContent).toContain("__clerk_environment");
        expect(rows[0].textContent).toContain("400");
        expect(rows[1].textContent).toContain("cc_cookie");
        expect(rows[1].textContent).toContain("182");
        expect(rows[1].textContent).toContain("TDDDG");
        expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(
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
        for (const key of [
          "__client",
          "__cf_bm",
          "_cfuvid",
          "__clerk_environment",
          "__client_uat_instance",
          "stream-viewer-session:fingerprint",
          "catdex-upload:client-key",
          "classic-wheel:client-key",
          "paletteGenerator.collection",
        ])
          expect(isDeclaredStorageKey(key)).toBe(true);
        expect(sections[14].textContent).toContain(
          lang === "de" ? "Abschnitt 9" : "section 9",
        );
        expect(sections[14].textContent).toContain("Cookie settings");
        const telemetry = sections[8];
        for (const value of [
          "Umami",
          "GlitchTip",
          "umami.heerlab.com",
          "glitchtip.heerlab.com",
          TELEMETRY_RETENTION[lang],
          lang === "de" ? "25 Monaten" : "25 months",
          lang === "de" ? "30 Tagen" : "30 days",
          lang === "de"
            ? "Die IP-Adresse wird aus technischen Gründen übertragen und von GlitchTip nur in gekürzter, anonymisierter Form gespeichert."
            : "The IP address is transmitted for technical reasons, and GlitchTip stores it only in shortened, anonymised form.",
          "90",
          "Art. 21",
          "Cookie settings",
        ])
          expect(telemetry.textContent).toContain(value);
        expect(telemetry.textContent).not.toMatch(
          /OFFEN|PENDING|Standardaufbewahrung|default retention|PostHog|\d+\s*%|umami\.disabled|sendDefaultPii|Breadcrumbs|IPv[46]|localStorage|sessionStorage|Discord-Bot|Pixelator/i,
        );
        expect(telemetry.textContent).toContain(
          lang === "de" ? "Abschnitt 15" : "Section 15",
        );
        expect(telemetry.textContent).toContain(
          lang === "de" ? "Art. 6 Abs. 1 lit. a DSGVO" : "Art. 6(1)(a) GDPR",
        );
        expect(telemetry.textContent).toContain(
          lang === "de" ? "Art. 6 Abs. 1 lit. f DSGVO" : "Art. 6(1)(f) GDPR",
        );
        const paragraphs = sections[12].querySelectorAll("p");
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
  expect(doc.querySelector("button")?.textContent).toBe("Cookie settings");
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
