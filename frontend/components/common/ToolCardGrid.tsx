import { ArrowRight } from "lucide-react";
import Link from "next/link";

export type ToolCard = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  comingSoon?: boolean;
  statusLabel?: string;
};

type ToolCardGridProps = {
  cards: ToolCard[];
  /** e.g. "group-hover:text-gradient-gacha" — must appear as a full literal at the call site for Tailwind */
  titleGradientClass: string;
  /** e.g. "hover:border-amber-400/30" */
  hoverBorderClass: string;
  /** e.g. "from-amber-500/5 via-transparent to-orange-500/5" */
  overlayGradientClass: string;
  /** e.g. "md:grid-cols-2" — defaults to the 3-column layout */
  gridClass?: string;
};

export function ToolCardGrid({
  cards,
  titleGradientClass,
  hoverBorderClass,
  overlayGradientClass,
  gridClass = "md:grid-cols-2 xl:grid-cols-3",
}: ToolCardGridProps) {
  return (
    <section className={`grid gap-5 ${gridClass}`}>
      {cards.map((card, index) => {
        const isActive = Boolean(!card.comingSoon && card.href);
        const baseClasses =
          "glass-card relative flex h-full flex-col gap-4 p-6 transition-all duration-500 overflow-hidden group animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards";
        const wrapperProps = {
          className: isActive
            ? `${baseClasses} hover:-translate-y-2 hover:shadow-2xl ${hoverBorderClass}`
            : `${baseClasses} opacity-70 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 animate-pulse-soft`,
          style: { animationDelay: `${index * 50}ms` },
        };

        const content = (
          <>
            <div
              className={`absolute inset-0 bg-gradient-to-br ${overlayGradientClass} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              role="presentation"
              aria-hidden="true"
            />
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

            <div className="flex items-start justify-between">
              <div
                className="text-4xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                aria-hidden
              >
                {card.icon}
              </div>
              {card.comingSoon && (
                <span className="rounded-full bg-primary/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary shadow-[0_0_10px_rgba(236,72,153,0.2)]">
                  {card.statusLabel ?? "Coming soon"}
                </span>
              )}
            </div>

            <div className="relative z-10">
              <h3
                className={`text-xl font-bold text-foreground ${titleGradientClass} transition-colors`}
              >
                {card.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">
                {card.description}
              </p>
            </div>

            {isActive && (
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-primary transition-transform group-hover:translate-x-2 pt-2">
                Launch Tool <ArrowRight className="size-3" />
              </span>
            )}
          </>
        );

        return isActive && card.href ? (
          <Link key={card.title} href={card.href} {...wrapperProps}>
            {content}
          </Link>
        ) : (
          <div key={card.title} {...wrapperProps}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
