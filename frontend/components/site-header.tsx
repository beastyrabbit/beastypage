"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { cn } from "@/lib/utils";
import type { ResolvedNavItem } from "@/components/site-nav-config";

type SiteHeaderProps = {
  navItems: ResolvedNavItem[];
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function SiteHeader({ navItems }: SiteHeaderProps) {
  const pathname = usePathname();
  const primary = navItems[0];
  const logoHref = primary?.href ?? "/";
  const logoPrefetch = !isExternalHref(logoHref);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href={logoHref} className="flex items-center gap-2 text-sm font-semibold tracking-wide" prefetch={logoPrefetch}>
          <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary">
            <Image src="/favicon.png" alt="BeastyRabbit" width={32} height={32} className="h-6 w-6 rounded-full" priority />
          </span>
          BeastyRabbit
        </Link>
        <nav className="hidden items-center gap-3 text-sm font-medium sm:flex">
          {navItems.map((item) => {
            const prefetch = isExternalHref(item.href) ? false : undefined;
            return (
              <Link
                key={item.key}
                href={item.href}
                data-accent={item.key}
                className={cn("nav-pill", pathname === item.defaultHref && "nav-pill--active")}
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
