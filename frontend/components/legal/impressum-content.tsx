import Link from "next/link";
import type { LegalLanguage } from "@/lib/legal/operator";
import { LegalPage } from "./legal-page";
import {
  ContactFormLink,
  LegalEmail,
  OperatorAddress,
} from "./operator-contact";

type ImpressumCopy = Readonly<{
  title: string;
  counterpart: string;
  providerHeading: string;
  contactHeading: string;
  emailLabel: string;
  contactFormLabel: string;
  noteHeading: string;
  note: string;
  privacyHeading: string;
  privacyIntroduction: string;
  privacyPath: string;
  privacyLabel: string;
}>;

export const impressumCopy = {
  de: {
    title: "Impressum",
    counterpart: "/legal-notice",
    providerHeading: "Anbieter",
    contactHeading: "Kontakt",
    emailLabel: "E-Mail: ",
    contactFormLabel: "Kontaktformular: ",
    noteHeading: "Hinweis",
    note: "BeastyPage ist ein privates, nicht-kommerzielles Projekt. Freiwillige Unterstützung über Ko-fi ist möglich; dafür gibt es keine Gegenleistung.",
    privacyHeading: "Datenschutz",
    privacyIntroduction:
      "Informationen zur Verarbeitung personenbezogener Daten finden Sie in der ",
    privacyPath: "/datenschutz",
    privacyLabel: "Datenschutzerklärung",
  },
  en: {
    title: "Legal Notice (Impressum)",
    counterpart: "/impressum",
    providerHeading: "Provider",
    contactHeading: "Contact",
    emailLabel: "E-mail: ",
    contactFormLabel: "Contact form: ",
    noteHeading: "Note",
    note: "BeastyPage is a private, non-commercial project. Voluntary support via Ko-fi is possible; nothing is offered in return.",
    privacyHeading: "Privacy",
    privacyIntroduction:
      "For information on how personal data is processed, see the ",
    privacyPath: "/privacy",
    privacyLabel: "Privacy Policy",
  },
} as const;

export function ImpressumContent({
  lang,
  copy,
}: Readonly<{ lang: LegalLanguage; copy: ImpressumCopy }>) {
  return (
    <LegalPage lang={lang} title={copy.title} counterpart={copy.counterpart}>
      <section>
        <h2>{copy.providerHeading}</h2>
        <OperatorAddress lang={lang} />
      </section>
      <section>
        <h2>{copy.contactHeading}</h2>
        <p>
          {copy.emailLabel}
          <LegalEmail kind="impressum" />
          <br />
          {copy.contactFormLabel}
          <ContactFormLink />
        </p>
      </section>
      <section>
        <h2>{copy.noteHeading}</h2>
        <p>{copy.note}</p>
      </section>
      <section>
        <h2>{copy.privacyHeading}</h2>
        <p>
          {copy.privacyIntroduction}
          <Link href={copy.privacyPath}>{copy.privacyLabel}</Link>
          {"."}
        </p>
      </section>
    </LegalPage>
  );
}
