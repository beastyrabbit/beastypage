import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import {
  ContactFormLink,
  LegalEmail,
  OperatorAddress,
} from "@/components/legal/operator-contact";

export const metadata: Metadata = {
  title: "Legal Notice (Impressum) | BeastyPage",
  robots: { index: false, follow: true },
};

export default function LegalNoticePage() {
  const lang = "en";
  return (
    <LegalPage
      lang={lang}
      title="Legal Notice (Impressum)"
      counterpart="/impressum"
    >
      <section>
        <h2>{"Provider"}</h2>
        <OperatorAddress lang={lang} />
      </section>
      <section>
        <h2>{"Contact"}</h2>
        <p>
          {"E-mail: "}
          <LegalEmail kind="impressum" />
          <br />
          {"Contact form: "}
          <ContactFormLink />
        </p>
      </section>
      <section>
        <h2>{"Note"}</h2>
        <p>
          {
            "BeastyPage is a private, non-commercial project. Voluntary support via Ko-fi is possible; nothing is offered in return."
          }
        </p>
      </section>
      <section>
        <h2>{"Privacy"}</h2>
        <p>
          {"For information on how personal data is processed, see the "}
          <Link href="/privacy">{"Privacy Policy"}</Link>
          {"."}
        </p>
      </section>
    </LegalPage>
  );
}
