import { AncestryTreeViewClient } from "./AncestryTreeViewClient";

type AncestryTreeViewPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: AncestryTreeViewPageProps) {
  const resolved = await params;
  return {
    title: `Ancestry Tree • ${resolved.slug}`,
    description: "View all cats in this ancestry tree.",
  };
}

export default async function AncestryTreeViewPage({ params }: AncestryTreeViewPageProps) {
  const resolved = await params;
  return <AncestryTreeViewClient slug={resolved.slug} />;
}
