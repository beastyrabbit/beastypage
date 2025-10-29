import { AdoptionBatchClient } from "@/components/adoption/AdoptionBatchClient";

type AdoptionBatchPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: AdoptionBatchPageProps) {
  const resolved = await params;
  return {
    title: `Adoption Batch • ${resolved.slug}`,
  };
}

export default async function AdoptionBatchPage({ params }: AdoptionBatchPageProps) {
  const resolved = await params;
  return <AdoptionBatchClient slug={resolved.slug} />;
}
