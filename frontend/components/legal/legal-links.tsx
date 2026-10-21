import Link from "next/link";

export function LegalLinks() {
  return (
    <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
      <span>
        <Link href="/impressum" lang="de">
          Impressum
        </Link>
        {" · "}
        <Link href="/datenschutz" lang="de">
          Datenschutz
        </Link>
      </span>
      <span>
        <Link href="/legal-notice">Legal notice</Link>
        {" · "}
        <Link href="/privacy">Privacy</Link>
      </span>
    </nav>
  );
}
