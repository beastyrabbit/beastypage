import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AncestryTreeClient } from "@/components/ancestry-tree";
import { PageHero } from "@/components/common/PageHero";
import type {
  AncestryTreeCat,
  PaletteMode,
  SerializedAncestryTree,
} from "@/lib/ancestry-tree/types";
import { getDb } from "@/server/db/client";
import { getBySlug as getPostgresTree } from "@/server/services/ancestry";

type PageParams = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tree = await getPostgresTree(getDb(), slug);
    if (!tree) return { title: "Tree Not Found | Warrior Cats | BeastyRabbit" };
    return {
      title: `${tree.name} | Ancestry Tree | BeastyRabbit`,
      description: `${tree.name} - A warrior cats family tree with ${tree.cats.length} cats across ${tree.config.depth + 1} generations.`,
    };
  } catch {
    return { title: "Ancestry Tree | Warrior Cats | BeastyRabbit" };
  }
}

export default async function ViewAncestryTreePage({
  params,
}: Readonly<PageParams>) {
  const { slug } = await params;
  const treeData = await getPostgresTree(getDb(), slug);
  if (!treeData) notFound();
  const tree: SerializedAncestryTree = {
    id: treeData.id,
    slug: treeData.slug,
    name: treeData.name,
    foundingMotherId: treeData.foundingMotherId,
    foundingFatherId: treeData.foundingFatherId,
    cats: treeData.cats as AncestryTreeCat[],
    config: {
      partnerChance: 1,
      ...treeData.config,
      paletteModes: treeData.config.paletteModes as PaletteMode[] | undefined,
    },
    createdAt: treeData.createdAt,
    updatedAt: treeData.updatedAt,
    creatorName: treeData.creatorName ?? undefined,
  };
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <Link
          href="/projects/warrior-cats/ancestry-tree"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          New Tree
        </Link>
      </div>
      <PageHero
        eyebrow="Ancestry Tree"
        title={
          <span className="text-gradient-warrior-cats animate-shimmer bg-[length:200%_auto]">
            {tree.name}
          </span>
        }
        description={
          tree.creatorName
            ? `Created by ${tree.creatorName} • ${tree.cats.length} cats • ${tree.config.depth + 1} generations`
            : `${tree.cats.length} cats • ${tree.config.depth + 1} generations`
        }
      />
      <AncestryTreeClient
        initialTree={tree}
        initialHasPassword={treeData.hasPassword}
      />
    </main>
  );
}
