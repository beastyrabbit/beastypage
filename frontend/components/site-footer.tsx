import Image from "next/image";
import Link from "next/link";

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
    <footer className="border-t border-border/60 bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          &copy; {new Date().getFullYear()} Cat Gacha. Crafted with Convex,
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
            lots of cats
          </span>
          .
        </p>
        <div className="flex flex-wrap items-center gap-4">
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
