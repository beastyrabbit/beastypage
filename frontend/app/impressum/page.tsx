import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import {
  ContactFormLink,
  LegalEmail,
  OperatorAddress,
} from "@/components/legal/operator-contact";

export const metadata: Metadata = {
  title: "Impressum | BeastyPage",
  robots: { index: false, follow: true },
};

export default function LegalNoticePage() {
  const lang = "de";
  return (
    <LegalPage lang={lang} title="Impressum" counterpart="/legal-notice">
      <section>
        <h2>{"Anbieter"}</h2>
        <OperatorAddress lang={lang} />
      </section>
      <section>
        <h2>{"Kontakt"}</h2>
        <p>
          {"E-Mail: "}
          <LegalEmail kind="impressum" />
          <br />
          {"Kontaktformular: "}
          <ContactFormLink />
        </p>
      </section>
      <section>
        <h2>{"Hinweis"}</h2>
        <p>
          {
            "BeastyPage ist ein privates, nicht-kommerzielles Projekt. Freiwillige Unterstützung über Ko-fi ist möglich; dafür gibt es keine Gegenleistung."
          }
        </p>
      </section>
      <section>
        <h2>{"Datenschutz"}</h2>
        <p>
          {
            "Informationen zur Verarbeitung personenbezogener Daten finden Sie in der "
          }
          <Link href="/datenschutz">{"Datenschutzerklärung"}</Link>
          {"."}
        </p>
      </section>
    </LegalPage>
  );
}
