"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  accent: "hub" | "gatcha" | "stream" | "collection" | "personal";
  envKey?: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Hub", accent: "hub", envKey: "NEXT_PUBLIC_HUB_URL" },
  { href: "/gatcha", label: "Gatcha", accent: "gatcha", envKey: "NEXT_PUBLIC_GATCHA_URL" },
  { href: "/stream", label: "Stream Tools", accent: "stream", envKey: "NEXT_PUBLIC_STREAM_URL" },
  { href: "/collection", label: "Collection", accent: "collection", envKey: "NEXT_PUBLIC_COLLECTION_URL" },
  { href: "/personal", label: "Personal", accent: "personal", envKey: "NEXT_PUBLIC_PERSONAL_URL" },
];

function resolveNavHref(item: NavItem): string {
  if (item.envKey) {
    const value = process.env[item.envKey];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return item.href;
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href={resolveNavHref(NAV_ITEMS[0])}
          className="flex items-center gap-2 text-sm font-semibold tracking-wide"
          prefetch={!isExternalHref(resolveNavHref(NAV_ITEMS[0]))}
        >
          <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary">
            <Image src="/favicon.png" alt="BeastyRabbit" width={32} height={32} className="h-6 w-6 rounded-full" priority />
          </span>
          BeastyRabbit
        </Link>
        <nav className="hidden items-center gap-3 text-sm font-medium sm:flex">
          {NAV_ITEMS.map((item) => {
            const resolvedHref = resolveNavHref(item);
            const prefetch = isExternalHref(resolvedHref) ? false : undefined;
            return (
              <Link
                key={item.href}
                href={resolvedHref}
                data-accent={item.accent}
                className={cn(
                  "nav-pill",
                  pathname === item.href && "nav-pill--active"
                )}
                prefetch={prefetch}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <DiscordInviteButton />
      </div>
    </header>
  );
}
