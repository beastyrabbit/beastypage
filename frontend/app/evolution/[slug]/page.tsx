import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import { EvolutionBatchClient } from "@/components/evolution/EvolutionBatchClient";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Evolution Lineage | BeastyPage",
  description: "View a saved cat evolution lineage and edit its display names.",
};

type EvolutionBatchPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EvolutionBatchPage({
  params,
}: EvolutionBatchPageProps) {
  const resolved = await params;
  return (
    <div className={pixelFont.variable}>
      <EvolutionBatchClient slug={resolved.slug} />
    </div>
  );
}
