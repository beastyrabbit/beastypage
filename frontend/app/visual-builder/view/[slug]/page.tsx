import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";

export const metadata: Metadata = {
  title: "Shared Visual Builder Cat",
  description: "Load a shared visual-builder configuration by slug.",
};

type PageProps = {
  params: { slug: string };
};

export default function VisualBuilderViewPage({ params }: PageProps) {
  const slug = params.slug;
  if (!slug) {
    notFound();
  }
  return <VisualBuilderLoader slug={slug} />;
}
