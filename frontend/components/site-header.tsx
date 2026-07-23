"use client";

import { useConvexAuth } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UserAuthButton } from "@/components/auth/UserAuthButton";
import { DiscordInviteButton } from "@/components/common/DiscordInviteButton";
import { NAV_ITEMS } from "@/components/site-nav-config";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.authRequired || isAuthenticated,
  );

  const isActive = (item: (typeof NAV_ITEMS)[0]) => {
    // For personal (home), only exact match
    if (item.key === "personal") {
      return pathname === "/";
    }
    // For projects, match /projects and /projects/*
    if (item.key === "projects") {
      return pathname === "/projects" || pathname.startsWith("/projects/");
    }
    // For other items, exact match or starts with
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the route value intentionally closes an open mobile menu
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [mobileOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-wide"
        >
          <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary">
            <Image
              src="/favicon.png"
              alt="BeastyRabbit"
              width={32}
              height={32}
              className="h-6 w-6 rounded-full"
              priority
            />
          </span>
          <span className="hidden sm:inline">BeastyRabbit</span>
        </Link>
        <nav className="hidden items-center gap-2 text-sm font-medium lg:flex">
          {visibleItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              data-accent={item.key}
              className={cn("nav-pill", isActive(item) && "nav-pill--active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <UserAuthButton />
          <div className="hidden lg:block">
            <DiscordInviteButton />
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 text-foreground lg:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-site-navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="sr-only">
              {mobileOpen ? "Close navigation" : "Open navigation"}
            </span>
            <span className="flex w-4 flex-col gap-1" aria-hidden>
              <span
                className={cn(
                  "h-px w-full bg-current transition",
                  mobileOpen && "translate-y-[5px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "h-px w-full bg-current transition",
                  mobileOpen && "opacity-0",
                )}
              />
              <span
                className={cn(
                  "h-px w-full bg-current transition",
                  mobileOpen && "-translate-y-[5px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>
      {mobileOpen ? (
        <div
          id="mobile-site-navigation"
          className="border-t border-border/60 bg-background px-4 py-4 lg:hidden"
        >
          <nav
            className="mx-auto grid max-w-6xl grid-cols-2 gap-2 text-sm font-medium sm:grid-cols-3"
            aria-label="Mobile navigation"
          >
            {visibleItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                data-accent={item.key}
                className={cn(
                  "rounded-lg border border-border/50 px-3 py-2.5 text-muted-foreground transition hover:bg-muted hover:text-foreground",
                  isActive(item) &&
                    "border-primary/40 bg-primary/10 text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mx-auto mt-3 max-w-6xl border-t border-border/50 pt-3">
            <DiscordInviteButton className="w-full rounded-lg py-2" />
          </div>
        </div>
      ) : null}
    </header>
  );
}
