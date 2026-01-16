"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PawPrint, Sparkles, Palette, Gamepad2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROJECT_CATEGORIES, type ProjectCategory } from "@/components/site-nav-config";

const CATEGORY_ICONS: Record<ProjectCategory, React.ComponentType<{ className?: string }>> = {
  "warrior-cats": PawPrint,
  gacha: Sparkles,
  artist: Palette,
  games: Gamepad2,
};

export function ProjectsSubNav() {
  const pathname = usePathname();

  const getIsActive = (categoryHref: string) => {
    return pathname === categoryHref || pathname.startsWith(`${categoryHref}/`);
  };

  return (
    <nav className="sticky top-16 z-40 border-b border-border/40 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide sm:gap-2 sm:justify-center">
          {PROJECT_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.key];
            const isActive = getIsActive(category.href);

            return (
              <Link
                key={category.key}
                href={category.href}
                data-category={category.key}
                className={cn(
                  "projects-subnav-pill flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "projects-subnav-pill--active"
                    : "border border-white/5 bg-white/5 text-muted-foreground hover:border-white/10 hover:bg-white/10 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                <span className="whitespace-nowrap">{category.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
