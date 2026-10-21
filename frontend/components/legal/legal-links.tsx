import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/impressum", label: "Impressum", lang: "de" },
  { href: "/datenschutz", label: "Datenschutz", lang: "de" },
  { href: "/legal-notice", label: "Legal notice" },
  { href: "/privacy", label: "Privacy" },
];

export function LegalLinks() {
  return (
    <nav
      aria-label="Legal"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {LEGAL_LINKS.map(({ href, label, lang }) => (
        <Link
          key={href}
          href={href}
          lang={lang}
          className="link-underline hover:text-foreground"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
