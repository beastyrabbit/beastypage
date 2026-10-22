import Image from "next/image";
import Link from "next/link";
import { CookieSettings } from "@/components/cookie-settings";
import { LegalLinks } from "@/components/legal/legal-links";

const FOOTER_LINKS = [
  { href: "https://github.com/BeastyTwitch", label: "GitHub" },
  { href: "https://twitch.tv/BeastyRabbit", label: "Twitch" },
  {
    href: "https://github.com/beastyrabbit/beastypage/issues/new",
    label: "Report Issue",
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-x-8 gap-y-1.5 px-6 py-3 text-xs text-muted-foreground xl:flex-row xl:justify-between">
        <p className="text-center">
          &copy; {new Date().getFullYear()} Cat Gacha. Crafted with PostgreSQL,
          Next.js, and{" "}
          <span className="peek-host">
            <span className="peek-wrap" aria-hidden>
              <Image
                src="/favicon.png"
                alt=""
                width={22}
                height={22}
                className="peek"
              />
            </span>
            {"lots of cats"}
          </span>
          {"."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <LegalLinks />
          <CookieSettings />
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
