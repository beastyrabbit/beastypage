import type { Metadata } from "next";
import localFont from "next/font/local";
import { EvolutionBatchClient } from "@/components/evolution/EvolutionBatchClient";

const pixelFont = localFont({
  src: "../../../fonts/pressstart2p/PressStart2P-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Press Start 2P Fallback"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Evolution Lineage | BeastyPage",
  description: "View a saved cat evolution lineage.",
};

type EvolutionBatchPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EvolutionBatchPage({
  params,
}: Readonly<EvolutionBatchPageProps>) {
  const resolved = await params;
  return (
    <div className={pixelFont.variable}>
      <EvolutionBatchClient slug={resolved.slug} />
    </div>
  );
}
