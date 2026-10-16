// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertSecureConnection, readDatabaseConfig } from "./config";
import { checkCompatibility, type DatabaseSchemaState } from "./schema-version";

const state = (
  version: number,
  compatibleFrom: number,
): DatabaseSchemaState => ({
  version,
  compatibleFrom,
  appVersion: "test",
  appliedAt: new Date(0),
});

describe("database config", () => {
  it("requires a URL and points at the local workflow", () => {
    expect(() => readDatabaseConfig("app", {})).toThrow(/db:local up/);
  });

  it("prefers the role-specific URL", () => {
    const config = readDatabaseConfig("migrate", {
      DATABASE_URL: "postgresql://app@127.0.0.1/db",
      DATABASE_MIGRATION_URL: "postgresql://owner@127.0.0.1/db",
    });
    expect(config.url).toContain("owner@");
    expect(config.statementTimeoutMs).toBe(0);
  });

  it("only permits the import role to fall back on loopback", () => {
    expect(
      readDatabaseConfig("import", {
        DATABASE_URL: "postgresql://app@127.0.0.1/db",
      }).url,
    ).toContain("127.0.0.1");
    expect(() =>
      readDatabaseConfig("import", {
        DATABASE_URL: "postgresql://app@db.internal/db",
      }),
    ).toThrow(/DATABASE_IMPORT_URL/);
  });

  it("uses the app budget of 6 connections per replica", () => {
    expect(
      readDatabaseConfig("app", { DATABASE_URL: "postgresql://a@localhost/db" })
        .poolMax,
    ).toBe(6);
  });

  it("requires verify-full TLS in production for remote hosts", () => {
    const production = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() =>
      assertSecureConnection("postgresql://a@db.internal/db", production),
    ).toThrow(/verify-full/);
    expect(() =>
      assertSecureConnection(
        "postgresql://a@db.internal/db?sslmode=require",
        production,
      ),
    ).toThrow(/verify-full/);
    expect(() =>
      assertSecureConnection(
        "postgresql://a@db.internal/db?sslmode=verify-full",
        production,
      ),
    ).not.toThrow();
    expect(() =>
      assertSecureConnection("postgresql://a@127.0.0.1/db", production),
    ).not.toThrow();
  });

  it("rejects non-postgres URLs", () => {
    expect(() => assertSecureConnection("mysql://a@localhost/db")).toThrow(
      /postgres/,
    );
  });
});

describe("schema compatibility", () => {
  it("fails closed without a recorded version", () => {
    expect(checkCompatibility(null, 1).ok).toBe(false);
  });

  it("refuses an application newer than the database", () => {
    expect(checkCompatibility(state(1, 1), 2)).toMatchObject({ ok: false });
  });

  it("refuses an application older than the contract floor", () => {
    expect(checkCompatibility(state(5, 4), 3)).toMatchObject({ ok: false });
  });

  it("accepts an older application after expand-only migrations", () => {
    expect(checkCompatibility(state(5, 1), 3)).toMatchObject({ ok: true });
  });
});
