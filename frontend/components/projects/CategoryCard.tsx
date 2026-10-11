"use client";

import { Gamepad2, PawPrint, Wrench } from "lucide-react";
import Link from "next/link";
import {
  type ComponentType,
  type ForwardRefExoticComponent,
  type RefAttributes,
  useRef,
} from "react";
import type {
  ProjectCategory,
  ProjectCategoryConfig,
} from "@/components/site-nav-config";
import ArrowNarrowRightIcon from "@/components/ui/arrow-narrow-right-icon";
import PaintIcon from "@/components/ui/paint-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from "@/components/ui/types";

type AnimatedIcon = ForwardRefExoticComponent<
  AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>;
type StaticIcon = ComponentType<{ className?: string; size?: number }>;
type CategoryIcon =
  | { kind: "animated"; icon: AnimatedIcon }
  | { kind: "static"; icon: StaticIcon };

const CATEGORY_ICONS: Record<ProjectCategory, CategoryIcon> = {
  "warrior-cats": { kind: "static", icon: PawPrint },
  gacha: { kind: "animated", icon: SparklesIcon },
  artist: { kind: "animated", icon: PaintIcon },
  games: { kind: "static", icon: Gamepad2 },
  tools: { kind: "static", icon: Wrench },
};

type ToolPreview = {
  title: string;
  icon: string;
};

type CategoryCardProps = {
  category: ProjectCategoryConfig;
  toolPreviews: ToolPreview[];
  toolCount: number;
  index: number;
};

export function CategoryCard({
  category,
  toolPreviews,
  toolCount,
  index,
}: Readonly<CategoryCardProps>) {
  const entry = CATEGORY_ICONS[category.key];
  // Hovering anywhere on the card wakes the itshover icon, not just its svg.
  const iconRef = useRef<AnimatedIconHandle>(null);
  const wake = () => iconRef.current?.startAnimation();
  const rest = () => iconRef.current?.stopAnimation();

  return (
    <Link
      href={category.href}
      data-category={category.key}
      onPointerEnter={wake}
      onPointerLeave={rest}
      onFocus={wake}
      onBlur={rest}
      className="category-card glass-card group relative flex h-full flex-col gap-5 overflow-hidden p-7 transition-all duration-500 motion-safe:hover:-translate-y-1.5 hover:shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 fill-mode-backwards"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Category-specific gradient overlay */}
      <div
        className={`category-card-gradient category-card-gradient--${category.key} absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
        aria-hidden="true"
      />

      {/* Shine effect: one gloss sweep per hover */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent motion-safe:group-hover:animate-shine" />

      {/* Content */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-3 transition-[rotate,scale,background-color] duration-300 ease-spring group-hover:rotate-[5deg] group-hover:scale-[1.08] group-hover:bg-white/15">
            {entry.kind === "animated" ? (
              <entry.icon
                ref={iconRef}
                size={24}
                className="text-foreground/80 group-hover:text-foreground"
              />
            ) : (
              <entry.icon
                size={24}
                className="text-foreground/80 group-hover:text-foreground"
              />
            )}
          </div>
          <div>
            <h3
              className={`text-xl font-bold text-foreground group-hover:text-gradient-${category.key} transition-colors`}
            >
              {category.label}
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {toolCount} {toolCount === 1 ? "tool" : "tools"}
            </span>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">
        {category.description}
      </p>

      {/* Tool previews */}
      {toolPreviews.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-2">
          {toolPreviews.slice(0, 3).map((tool) => (
            <span
              key={tool.title}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:border-white/15 group-hover:text-foreground/70"
            >
              <span>{tool.icon}</span>
              <span className="max-w-20 truncate">{tool.title}</span>
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <span className="relative z-10 mt-auto inline-flex items-center gap-1 pt-2 text-xs font-bold text-primary transition-transform group-hover:translate-x-2">
        Explore {category.label} <ArrowNarrowRightIcon size={12} />
      </span>
    </Link>
  );
}
