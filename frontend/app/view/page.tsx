import type { Metadata } from "next";
import { ViewerClient } from "@/components/single-cat/ViewerClient";

export const metadata: Metadata = {
  title: "Shared Cat Viewer | BeastyPage",
  description: "View a shared cat card and open related generator tools.",
};

type ViewPageProps = {
  searchParams?: Promise<{ cat?: string }>;
};

export default async function ViewPage({ searchParams }: ViewPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const encoded = typeof resolved?.cat === "string" ? resolved.cat : null;
  return <ViewerClient encoded={encoded} />;
}
