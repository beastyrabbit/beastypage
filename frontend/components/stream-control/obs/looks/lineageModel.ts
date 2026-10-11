/**
 * The evolution lineage as every look sees it: a starter plus branches of
 * cats ordered by level, with rendered preview URLs attached. Pure, so the
 * looks can be unit-tested and previewed without the renderer.
 */

import {
  type ArchetypeTheme,
  getArchetypeTheme,
} from "@/components/evolution/archetypes";
import {
  formatAddition,
  formatValue,
  stageRank,
} from "@/components/evolution/evolutionDisplay";
import type { CatParams } from "@/lib/cat-v3/types";
import type { EvolutionAddition } from "@/lib/evolution/evolutionGenerator";
import type { EvolutionStreamCommand } from "@/lib/evolution/streamEvolution";

export interface LineageCat {
  key: string;
  label: string;
  level: number;
  branchLabel: string | null;
  archetype: string | null;
  additions: EvolutionAddition[];
  previewUrl: string | null;
  params: CatParams;
}

export interface LineageBranch {
  label: string;
  archetype: string | null;
  theme: ArchetypeTheme;
  /** Cats of this branch, lowest level first. */
  cats: LineageCat[];
}

export interface LineageModel {
  slug: string;
  /** Absolute URL for the QR code. */
  url: string;
  totalCount: number;
  starter: LineageCat | null;
  branches: LineageBranch[];
  /** Deepest branch length. */
  maxLevels: number;
  /** Every cat in command order, starter included. */
  cats: LineageCat[];
}

export interface PreviewSource {
  key: string;
  previewUrl: string | null;
}

export function buildLineageModel(
  command: EvolutionStreamCommand,
  previews: readonly PreviewSource[],
  url: string,
): LineageModel {
  const previewByKey = new Map(previews.map((p) => [p.key, p.previewUrl]));
  const cats: LineageCat[] = command.cats.map((cat) => ({
    key: cat.key,
    label: cat.label,
    level: cat.level,
    branchLabel: cat.branchLabel,
    archetype: cat.archetype,
    additions: cat.additions,
    previewUrl: previewByKey.get(cat.key) ?? null,
    params: cat.catData.params,
  }));
  const starter = cats.find((cat) => cat.level === 0) ?? cats[0] ?? null;
  const branches: LineageBranch[] = [];
  for (const cat of cats) {
    if (cat.level === 0 || !cat.branchLabel) continue;
    let branch = branches.find((entry) => entry.label === cat.branchLabel);
    if (!branch) {
      branch = {
        label: cat.branchLabel,
        archetype: cat.archetype,
        theme: getArchetypeTheme(cat.archetype),
        cats: [],
      };
      branches.push(branch);
    }
    branch.cats.push(cat);
  }
  for (const branch of branches) {
    branch.cats.sort((a, b) => a.level - b.level);
  }
  return {
    slug: command.slug,
    url,
    totalCount: command.totalCount,
    starter,
    branches,
    maxLevels: Math.max(1, ...branches.map((branch) => branch.cats.length)),
    cats,
  };
}

/** Rank word for a cat's level ("Kit", "Apprentice", …). */
export function lineageRank(cat: Pick<LineageCat, "level">): string {
  return stageRank(cat.level);
}

/**
 * "+Lavender Collar" style tags for what a cat gained at its stop, full
 * words by default (pass `maxLength` to truncate with an ellipsis). Tortie
 * layers collapse to one tag; replacements show the new value.
 */
export function additionTags(
  additions: readonly EvolutionAddition[],
  max = 3,
  maxLength = Number.POSITIVE_INFINITY,
): string[] {
  const tags: string[] = [];
  for (const addition of additions) {
    let text: string;
    if (addition.kind === "tortie") {
      text = "+Tortie";
    } else if (addition.kind === "replacement") {
      text = `↻ ${formatValue(addition.value)}`;
    } else {
      text = `+${formatAddition(addition)}`;
    }
    if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
    tags.push(text);
    if (tags.length >= max) break;
  }
  return tags;
}
