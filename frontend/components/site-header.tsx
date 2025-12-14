"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/site-nav-config";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary">
            <Image src="/favicon.png" alt="BeastyRabbit" width={32} height={32} className="h-6 w-6 rounded-full" priority />
          </span>
          BeastyRabbit
        </Link>
        <nav className="hidden items-center gap-3 text-sm font-medium sm:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              data-accent={item.key}
              className={cn("nav-pill", pathname === item.href && "nav-pill--active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <DiscordInviteButton />
      </div>
    </header>
  );
}
