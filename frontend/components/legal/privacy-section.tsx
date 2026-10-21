import type { ReactNode } from "react";
import type { LegalLanguage } from "@/lib/legal/operator";

export type PrivacySectionProps = { lang: LegalLanguage; number: number };

export function PrivacySection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}
