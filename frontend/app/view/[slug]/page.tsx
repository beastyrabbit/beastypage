import { ViewerClient } from "@/components/single-cat/ViewerClient";

type ViewSlugPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ cat?: string }>;
};

export default async function ViewSlugPage({ params, searchParams }: ViewSlugPageProps) {
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const encoded = typeof resolvedSearch?.cat === "string" ? resolvedSearch.cat : null;
  return <ViewerClient slug={resolvedParams.slug} encoded={encoded} />;
}
