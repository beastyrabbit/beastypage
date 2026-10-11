import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  children?: ReactNode;
};

const ENTER =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:[animation-duration:700ms] fill-mode-backwards";

export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: Readonly<PageHeroProps>) {
  return (
    <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-8 text-balance shadow-[0_0_40px_rgba(245,158,11,0.15)]">
      <p className="text-xs uppercase tracking-widest text-amber-200/90 motion-safe:animate-track-in">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl motion-safe:animate-rise motion-safe:[animation-delay:120ms]">
        {title}
      </h1>
      {description ? (
        <p
          className={`mt-4 max-w-3xl text-sm text-neutral-200/85 sm:text-base ${ENTER} motion-safe:[animation-delay:220ms]`}
        >
          {description}
        </p>
      ) : null}
      {children ? (
        <div
          className={`mt-5 flex flex-wrap gap-3 ${ENTER} motion-safe:[animation-delay:320ms]`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
