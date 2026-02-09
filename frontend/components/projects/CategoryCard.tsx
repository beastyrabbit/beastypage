import Link from "next/link";
import { PawPrint, Gamepad2, Wrench } from "lucide-react";
import ArrowNarrowRightIcon from "@/components/ui/arrow-narrow-right-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import PaintIcon from "@/components/ui/paint-icon";

import type { ProjectCategory, ProjectCategoryConfig } from "@/components/site-nav-config";

const CATEGORY_ICONS: Record<ProjectCategory, React.ComponentType<{ className?: string; size?: number }>> = {
  "warrior-cats": PawPrint,
  gacha: SparklesIcon,
  artist: PaintIcon,
  games: Gamepad2,
  tools: Wrench,
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

export function CategoryCard({ category, toolPreviews, toolCount, index }: CategoryCardProps) {
  const Icon = CATEGORY_ICONS[category.key];

  return (
    <Link
      href={category.href}
      data-category={category.key}
      className="category-card glass-card group relative flex h-full flex-col gap-5 overflow-hidden p-7 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Category-specific gradient overlay */}
      <div
        className={`category-card-gradient category-card-gradient--${category.key} absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
        role="presentation"
        aria-hidden="true"
      />

      {/* Shine effect */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

      {/* Content */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-3 transition-colors group-hover:bg-white/15">
            <Icon size={24} className="text-foreground/80 group-hover:text-foreground" />
          </div>
          <div>
            <h3 className={`text-xl font-bold text-foreground group-hover:text-gradient-${category.key} transition-colors`}>
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
