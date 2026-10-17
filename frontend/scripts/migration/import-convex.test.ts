import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertDatabaseTarget,
  issuerModeFor,
  protectedRoot,
} from "./import/guards";
import { assertOutsideRepository } from "./import/run";

describe("import target and issuer guards", () => {
  it("requires an issuer unless loopback any-issuer mode is explicit", () => {
    expect(() => issuerModeFor(undefined, false, true)).toThrow(
      /expected-issuer is required/,
    );
    expect(issuerModeFor(undefined, true, true)).toEqual({
      mode: "any",
      expectedIssuer: null,
    });
    expect(() => issuerModeFor(undefined, true, false)).toThrow(/loopback/);
  });

  it("rejects conflicting issuer arguments", () => {
    expect(() => issuerModeFor("https://issuer.test", true, true)).toThrow(
      /either/,
    );
  });

  it("checks current_database before an import can write", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ name: "beastypage" }] }),
    };
    await assertDatabaseTarget(
      client as never,
      "postgresql://owner@127.0.0.1/beastypage",
      "beastypage",
      "test",
    );
    await expect(
      assertDatabaseTarget(
        client as never,
        "postgresql://owner@127.0.0.1/beastypage",
        "other",
        "test",
      ),
    ).rejects.toThrow(/expected other/);
  });
});

describe("protected root for archives and reports", () => {
  it("is the Git checkout when one exists above the script", () => {
    const repo = mkdtempSync(join(tmpdir(), "guard-repo-"));
    mkdirSync(join(repo, ".git"));
    mkdirSync(join(repo, "frontend/scripts/migration"), { recursive: true });
    expect(protectedRoot(join(repo, "frontend/scripts/migration"))).toBe(repo);
  });

  it("is the application directory for the bundles in the image", () => {
    const app = mkdtempSync(join(tmpdir(), "guard-app-"));
    mkdirSync(join(app, "scripts/migration"), { recursive: true });
    const root = protectedRoot(join(app, "scripts/migration"));
    expect(root).toBe(app);
    expect(() =>
      assertOutsideRepository(
        join(app, "reports"),
        root,
        "The report directory",
      ),
    ).toThrow(/outside the repository/);
    expect(() =>
      assertOutsideRepository(join(tmpdir(), "elsewhere"), root, "The archive"),
    ).not.toThrow();
  });

  it("treats every path as inside when the root is the filesystem root", () => {
    expect(() =>
      assertOutsideRepository(join(tmpdir(), "a.zip"), "/", "The archive"),
    ).toThrow(/outside the repository/);
  });
});
