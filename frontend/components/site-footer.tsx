import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Cat Gacha. Crafted with Convex, Next.js, and lots of cats.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="https://github.com/BeastyTwitch" target="_blank" className="hover:text-foreground">
            GitHub
          </Link>
          <Link href="https://twitch.tv/BeastyRabbit" target="_blank" className="hover:text-foreground">
            Twitch
          </Link>
        </div>
      </div>
    </footer>
  );
}
