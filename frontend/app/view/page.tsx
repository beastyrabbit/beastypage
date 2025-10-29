import { ViewerClient } from "@/components/single-cat/ViewerClient";

type ViewPageProps = {
  searchParams?: Promise<{ cat?: string }>;
};

export default async function ViewPage({ searchParams }: ViewPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const encoded = typeof resolved?.cat === "string" ? resolved.cat : null;
  return <ViewerClient encoded={encoded} />;
}
