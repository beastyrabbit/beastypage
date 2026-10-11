import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";

export const metadata: Metadata = {
  title: "Shared Visual Builder Cat",
  description: "Load a shared visual-builder configuration by slug.",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function VisualBuilderViewPage({
  params,
}: Readonly<PageProps>) {
  const { slug } = await params;
  if (!slug) {
    notFound();
  }
  return <VisualBuilderLoader slug={slug} />;
}
