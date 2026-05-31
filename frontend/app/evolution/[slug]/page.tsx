import type { Metadata } from "next";
import { EvolutionBatchClient } from "@/components/evolution/EvolutionBatchClient";

export const metadata: Metadata = {
  title: "Evolution Batch | BeastyPage",
  description: "View a saved cat evolution batch and edit its display names.",
};

type EvolutionBatchPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EvolutionBatchPage({
  params,
}: EvolutionBatchPageProps) {
  const resolved = await params;
  return <EvolutionBatchClient slug={resolved.slug} />;
}
