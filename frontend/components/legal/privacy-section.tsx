import type { ReactNode } from "react";
import type { LegalLanguage } from "@/lib/legal/operator";

export type PrivacySectionProps = Readonly<{
  lang: LegalLanguage;
  number: number;
}>;

export function PrivacySection({
  number,
  title,
  children,
}: Readonly<{
  number: number;
  title: string;
  children: ReactNode;
}>) {
  return (
    <section>
      <h2>
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}
