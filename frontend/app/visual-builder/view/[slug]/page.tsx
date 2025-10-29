import { notFound } from "next/navigation";

import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";

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
