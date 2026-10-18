import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_BY_DESIGN_COLUMNS,
  SENSITIVE_COLUMN_POLICY,
} from "./scrub-staging";

const schemaDir = resolve(
  dirname(import.meta.filename),
  "../../server/db/schema",
);
const sensitiveName =
  /(?:^|_)(?:token|key|hash|ip|identifier|discord|twitch|password)(?:_|$)/i;

function policyColumns(): Set<string> {
  const columns = new Set<string>();
  for (const group of Object.values(SENSITIVE_COLUMN_POLICY)) {
    for (const [table, names] of Object.entries(group)) {
      for (const name of names) columns.add(`${table}.${name}`);
    }
  }
  return columns;
}

describe("staging scrub policy", () => {
  it("covers every sensitive-looking schema column", () => {
    const covered = policyColumns();
    const findings: string[] = [];
    for (const file of [
      "catdex.ts",
      "cats.ts",
      "discord.ts",
      "games.ts",
      "quickShare.ts",
      "settings.ts",
      "stream.ts",
      "system.ts",
      "users.ts",
    ]) {
      const source = readFileSync(resolve(schemaDir, file), "utf8");
      const tableMatches = [
        ...source.matchAll(/pgTable\(\s*["']([^"']+)["']/g),
      ];
      for (const tableMatch of tableMatches) {
        const table = tableMatch[1] as string;
        const start = tableMatch.index ?? 0;
        const body = source.slice(start, source.indexOf("\n);", start));
        for (const match of body.matchAll(
          /(?:text|uuid|customType|timestamp|tstz|jsonb|bigint|integer|boolean|smallint)\(\s*["']([^"']+)["']/g,
        )) {
          const column = match[1] as string;
          if (
            sensitiveName.test(column) &&
            !covered.has(`${table}.${column}`) &&
            !PUBLIC_BY_DESIGN_COLUMNS.has(`${table}.${column}`)
          )
            findings.push(`${table}.${column}`);
        }
      }
    }
    expect(findings).toEqual([]);
  });
});
