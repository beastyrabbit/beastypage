import type { Metadata } from "next";
import { PageHero } from "@/components/common/PageHero";
import { ContactForm } from "./ContactForm";
import { contactSource } from "./source";

export const metadata: Metadata = {
  title: "Kontakt | BeastyRabbit",
  robots: { index: false, follow: false },
};

// Kept separate so a later privacy-page change can add a link here.
const CONTACT_PRIVACY_NOTICE =
  "Ihre Angaben (Name, E-Mail-Adresse, Nachricht) und der Zeitpunkt werden ausschließlich per E-Mail an den Betreiber (Tobias Heer) gesendet, um Ihre Anfrage zu beantworten, und nicht in einer Datenbank gespeichert. Zum Schutz vor Spam wird Ihre IP-Adresse bis zu 10 Minuten nach Ihrer letzten Anfrage nur im Arbeitsspeicher gehalten. Die Nachricht wird über den E-Mail-Dienst Resend (USA) an das Postfach des Betreibers bei Fastmail (Australien) gesendet. Fragen zum Datenschutz: datenschutz-beastyrabbit@heerlab.com";

const CONTACT_PRIVACY_NOTICE_EN =
  "Your details (name, email address, message) and the time of your request are sent only by email to the operator (Tobias Heer) to answer your enquiry and are not stored in a database. To prevent spam, your IP address is held only in memory until 10 minutes after your last request. The message is sent via the email service Resend (USA) to the operator's mailbox at Fastmail (Australia). Privacy questions: datenschutz-beastyrabbit@heerlab.com";

export default async function KontaktPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const source = contactSource((await searchParams).from);
  return (
    <main
      lang="de"
      className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-14"
    >
      <PageHero
        eyebrow="Kontaktformular"
        title="Kontakt"
        description="Senden Sie Ihre Anfrage über dieses Formular. Alle Felder sind erforderlich."
      >
        <p lang="en" className="text-sm text-neutral-200/85">
          Send your enquiry using this form. All fields are required.
        </p>
      </PageHero>
      <section
        aria-label="Nachricht an den Betreiber"
        className="rounded-2xl border border-border/70 bg-background/70 p-5 sm:p-8"
      >
        <ContactForm source={source} />
        <noscript>
          <p className="mt-5 text-sm">
            Dieses Formular benötigt JavaScript. Bitte schreiben Sie an{" "}
            impressum-beastyrabbit@heerlab.com. /{" "}
            <span lang="en">
              This form requires JavaScript. Please email
              impressum-beastyrabbit@heerlab.com.
            </span>
          </p>
        </noscript>
        <p className="mt-8 break-words text-sm leading-relaxed text-muted-foreground">
          {CONTACT_PRIVACY_NOTICE}
        </p>
        <p
          lang="en"
          className="mt-3 break-words text-sm leading-relaxed text-muted-foreground"
        >
          {CONTACT_PRIVACY_NOTICE_EN}
        </p>
      </section>
    </main>
  );
}
