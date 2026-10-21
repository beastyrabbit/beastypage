import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalLanguage } from "@/lib/legal/operator";
import { ContactFormLink } from "./operator-contact";

export function LegalPage({
  lang,
  title,
  counterpart,
  children,
}: {
  lang: LegalLanguage;
  title: string;
  counterpart: string;
  children: ReactNode;
}) {
  return (
    <main
      lang={lang}
      className="mx-auto max-w-3xl space-y-8 break-words px-4 py-10 text-base leading-relaxed sm:px-6 sm:py-14 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-muted-foreground [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
    >
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <nav
          aria-label={
            lang === "de"
              ? "Sprache und Rechtliches"
              : "Language and legal information"
          }
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
        >
          <Link
            href={counterpart}
            hrefLang={lang === "de" ? "en" : "de"}
            lang={lang === "de" ? "en" : "de"}
          >
            {lang === "de" ? "English" : "Deutsch"}
          </Link>
          <Link href={lang === "de" ? "/impressum" : "/legal-notice"}>
            {lang === "de" ? "Impressum" : "Legal notice"}
          </Link>
          <Link href={lang === "de" ? "/datenschutz" : "/privacy"}>
            {lang === "de" ? "Datenschutz" : "Privacy"}
          </Link>
          <ContactFormLink />
        </nav>
      </header>
      {children}
    </main>
  );
}
