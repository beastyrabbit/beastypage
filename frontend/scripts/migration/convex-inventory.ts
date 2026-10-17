// Builds the Convex-to-PostgreSQL migration inventory from source code.
// Run: tsx scripts/migration/convex-inventory.ts [--check]
//
// Writes docs/migration/convex-inventory.{json,md} at the repository root.
// `--check` fails when the committed report no longer matches the source.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, "../..");
const REPO = resolve(FRONTEND, "..");
const CONVEX_DIR = resolve(FRONTEND, "convex");
const OUT_JSON = resolve(REPO, "docs/migration/convex-inventory.json");
const OUT_MD = resolve(REPO, "docs/migration/convex-inventory.md");

const FUNCTION_KINDS = new Set([
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  "httpAction",
]);
const CLIENT_HOOKS = new Set([
  "useQuery",
  "useMutation",
  "useAction",
  "usePaginatedQuery",
]);
const AUTH_HOOKS = new Set(["useConvexAuth", "useConvex"]);
const SERVER_METHODS = new Set(["query", "mutation", "action"]);
const CRON_METHODS = new Set([
  "interval",
  "cron",
  "hourly",
  "daily",
  "weekly",
  "monthly",
]);

type Location = { file: string; line: number };

interface SchemaTable {
  name: string;
  fields: string[];
  anyFields: string[];
  idReferences: { path: string; table: string }[];
  storageFields: string[];
  indexes: { name: string; fields: string[] }[];
}

interface ConvexFunction extends Location {
  module: string;
  name: string;
  kind: string;
  usesAuth: boolean;
  tablesRead: string[];
  tablesWritten: string[];
  scheduler: string[];
  storageOps: string[];
  envVars: string[];
  fetches: boolean;
}

interface CallSite extends Location {
  kind: string;
  target: string;
  context: "client" | "server" | "test";
}

interface Inventory {
  generatedFrom: string;
  summary: Record<string, number>;
  tables: SchemaTable[];
  sharedValidatorAnyFields: string[];
  functions: ConvexFunction[];
  crons: (Location & { name: string; schedule: string; target: string })[];
  httpRoutes: (Location & { path: string; method: string; handler: string })[];
  scheduledCalls: (Location & { target: string; delay: string })[];
  clientCalls: CallSite[];
  serverCalls: CallSite[];
  authHookCalls: CallSite[];
  nestedStorageReferences: (Location & { identifier: string })[];
  externalCallers: (Location & { service: string; detail: string })[];
  deploymentReferences: (Location & { detail: string })[];
}

function rel(file: string): string {
  return relative(REPO, file);
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function calleeName(call: ts.CallExpression): string | null {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function stringArg(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeCell(value: string): string {
  return value.replaceAll("|", String.raw`\|`);
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

// ---------------------------------------------------------------- schema

type ValidatorTable = Pick<
  SchemaTable,
  "anyFields" | "idReferences" | "storageFields"
>;

function handleSimpleValidator(
  node: ts.CallExpression,
  path: string,
  table: ValidatorTable,
): boolean {
  const name = calleeName(node);
  if (name === "any") {
    table.anyFields.push(path);
    return true;
  }
  if (name !== "id") return false;
  const target = stringArg(node.arguments[0]) ?? "?";
  if (target === "_storage") table.storageFields.push(path);
  else table.idReferences.push({ path, table: target });
  return true;
}

function visitObjectValidator(
  arg: ts.Node | undefined,
  path: string,
  table: ValidatorTable,
): void {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    validatorDetails(prop.initializer, `${path}.${prop.name.getText()}`, table);
  }
}

function validatorDetails(
  node: ts.Node,
  path: string,
  table: ValidatorTable,
): void {
  if (!ts.isCallExpression(node)) return;
  if (handleSimpleValidator(node, path, table)) return;
  const name = calleeName(node);
  if (name === "object") {
    visitObjectValidator(node.arguments[0], path, table);
    return;
  }
  const nextPath = name === "array" ? `${path}[]` : path;
  for (const arg of node.arguments) validatorDetails(arg, nextPath, table);
}

function readSchema(): {
  tables: SchemaTable[];
  sharedValidatorAnyFields: string[];
} {
  const file = resolve(CONVEX_DIR, "schema.ts");
  const source = parse(file);
  const tables: SchemaTable[] = [];
  const shared: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
      const scratch = {
        anyFields: [] as string[],
        idReferences: [],
        storageFields: [],
      };
      validatorDetails(decl.initializer, decl.name.text, scratch);
      shared.push(...scratch.anyFields);
    }
  }

  walk(source, (node) => collectSchemaTables(node, tables));

  return { tables, sharedValidatorAnyFields: shared };
}

function newSchemaTable(name: string): SchemaTable {
  return {
    name,
    fields: [],
    anyFields: [],
    idReferences: [],
    storageFields: [],
    indexes: [],
  };
}

function readSchemaTableFields(
  shape: ts.Node | undefined,
  table: SchemaTable,
): void {
  if (!shape || !ts.isObjectLiteralExpression(shape)) return;
  for (const field of shape.properties) {
    if (!ts.isPropertyAssignment(field)) continue;
    const fieldName = field.name.getText();
    table.fields.push(fieldName);
    validatorDetails(field.initializer, fieldName, table);
  }
}

function unwindSchemaTable(
  initializer: ts.Expression,
  table: SchemaTable,
): void {
  let expr = initializer;
  while (ts.isCallExpression(expr)) {
    const name = calleeName(expr);
    if (name === "index" && ts.isPropertyAccessExpression(expr.expression)) {
      const fieldsArg = expr.arguments[1];
      table.indexes.unshift({
        name: stringArg(expr.arguments[0]) ?? "?",
        fields:
          fieldsArg && ts.isArrayLiteralExpression(fieldsArg)
            ? fieldsArg.elements.map((element) => stringArg(element) ?? "?")
            : [],
      });
      expr = expr.expression.expression;
      continue;
    }
    if (name === "defineTable") readSchemaTableFields(expr.arguments[0], table);
    break;
  }
}

function collectSchemaTables(node: ts.Node, tables: SchemaTable[]): void {
  if (!ts.isCallExpression(node) || calleeName(node) !== "defineSchema") return;
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const table = newSchemaTable(prop.name.getText());
    unwindSchemaTable(prop.initializer, table);
    tables.push(table);
  }
}

// ------------------------------------------------------------- functions

function convexModules(): string[] {
  return globSync("*.ts", { cwd: CONVEX_DIR, absolute: true })
    .filter((file) => !file.endsWith(".test.ts"))
    .sort();
}

function functionDetails(
  node: ts.Node,
): Omit<ConvexFunction, keyof Location | "module" | "name" | "kind"> {
  const tablesRead = new Set<string>();
  const tablesWritten = new Set<string>();
  const scheduler = new Set<string>();
  const storageOps = new Set<string>();
  const envVars = new Set<string>();
  let usesAuth = false;
  let fetches = false;

  const state = {
    tablesRead,
    tablesWritten,
    scheduler,
    storageOps,
    envVars,
    usesAuth: () => (usesAuth = true),
    fetches: () => (fetches = true),
  };
  walk(node, (child) => inspectFunctionNode(child, state));

  return {
    usesAuth,
    tablesRead: sorted(tablesRead),
    tablesWritten: sorted(tablesWritten),
    scheduler: sorted(scheduler),
    storageOps: sorted(storageOps),
    envVars: sorted(envVars),
    fetches,
  };
}

type FunctionDetailsState = {
  tablesRead: Set<string>;
  tablesWritten: Set<string>;
  scheduler: Set<string>;
  storageOps: Set<string>;
  envVars: Set<string>;
  usesAuth: () => void;
  fetches: () => void;
};

function inspectFunctionProperty(
  child: ts.PropertyAccessExpression,
  state: FunctionDetailsState,
): void {
  const text = child.getText();
  if (/\bctx\.auth\b/.test(text)) state.usesAuth();
  if (
    ts.isPropertyAccessExpression(child.expression) &&
    child.expression.getText() === "process.env"
  ) {
    state.envVars.add(child.name.text);
  }
}

function inspectFunctionCall(
  child: ts.CallExpression,
  state: FunctionDetailsState,
): void {
  const name = calleeName(child);
  const callee = child.expression.getText();
  if (name === "fetch" && ts.isIdentifier(child.expression)) state.fetches();
  inspectDatabaseCall(callee, child, state);
  if (/\.storage\.\w+$/.test(callee) && name) state.storageOps.add(name);
  if (/\.scheduler\.(runAfter|runAt)$/.test(callee) && child.arguments[1]) {
    state.scheduler.add(compact(child.arguments[1].getText()));
  }
  // Shared auth helpers (requireIdentity, getIdentity, ...) hide ctx.auth.
  if (name && /identity|requireUser|currentUser|requireOwner/i.test(name)) {
    state.usesAuth();
  }
}

function inspectDatabaseCall(
  callee: string,
  child: ts.CallExpression,
  state: FunctionDetailsState,
): void {
  if (callee.endsWith(".db.query")) {
    const table = stringArg(child.arguments[0]);
    if (table) state.tablesRead.add(table);
  }
  if (callee.endsWith(".db.insert")) {
    const table = stringArg(child.arguments[0]);
    if (table) state.tablesWritten.add(table);
  }
}

function inspectFunctionNode(
  child: ts.Node,
  state: FunctionDetailsState,
): void {
  if (ts.isPropertyAccessExpression(child))
    inspectFunctionProperty(child, state);
  if (ts.isCallExpression(child)) inspectFunctionCall(child, state);
}

function readFunctions(): {
  functions: ConvexFunction[];
  scheduledCalls: Inventory["scheduledCalls"];
} {
  const functions: ConvexFunction[] = [];
  const scheduledCalls: Inventory["scheduledCalls"] = [];
  for (const file of convexModules()) {
    const source = parse(file);
    const module = rel(file)
      .replace(/^frontend\/convex\//, "")
      .replace(/\.ts$/, "");
    functions.push(...readModuleFunctions(source, file, module));
    scheduledCalls.push(...readModuleSchedules(source, file));
  }
  return { functions, scheduledCalls };
}

function readModuleFunctions(
  source: ts.SourceFile,
  file: string,
  module: string,
): ConvexFunction[] {
  const functions: ConvexFunction[] = [];
  for (const statement of source.statements) {
    functions.push(...readModuleStatement(source, file, module, statement));
  }
  return functions;
}

function readModuleStatement(
  source: ts.SourceFile,
  file: string,
  module: string,
  statement: ts.Statement,
): ConvexFunction[] {
  if (!ts.isVariableStatement(statement)) return [];
  const exported = statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
  if (!exported) return [];
  return statement.declarationList.declarations.flatMap((decl) => {
    const init = decl.initializer;
    if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(decl.name))
      return [];
    const kind = calleeName(init);
    if (!kind || !FUNCTION_KINDS.has(kind)) return [];
    return [
      {
        file: rel(file),
        line: lineOf(source, decl),
        module,
        name: decl.name.text,
        kind,
        ...functionDetails(init),
      },
    ];
  });
}

function readModuleSchedules(
  source: ts.SourceFile,
  file: string,
): Inventory["scheduledCalls"] {
  const scheduledCalls: Inventory["scheduledCalls"] = [];
  walk(source, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !/\.scheduler\.(runAfter|runAt)$/.test(node.expression.getText()) ||
      !node.arguments[1]
    )
      return;
    scheduledCalls.push({
      file: rel(file),
      line: lineOf(source, node),
      target: compact(node.arguments[1].getText()),
      delay: compact(node.arguments[0]?.getText() ?? ""),
    });
  });
  return scheduledCalls;
}

function readCrons(): Inventory["crons"] {
  const file = resolve(CONVEX_DIR, "crons.ts");
  const source = parse(file);
  const crons: Inventory["crons"] = [];
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calleeName(node);
    if (
      !name ||
      !CRON_METHODS.has(name) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.expression.getText() !== "crons"
    ) {
      return;
    }
    crons.push({
      file: rel(file),
      line: lineOf(source, node),
      name: stringArg(node.arguments[0]) ?? "?",
      schedule: `${name} ${compact(node.arguments[1]?.getText() ?? "")}`,
      target: compact(
        node.arguments
          .slice(2)
          .map((a) => a.getText())
          .join(", "),
      ),
    });
  });
  return crons;
}

function readHttpRoutes(): Inventory["httpRoutes"] {
  const file = resolve(CONVEX_DIR, "http.ts");
  const source = parse(file);
  const routes: Inventory["httpRoutes"] = [];
  walk(source, (node) => {
    if (!ts.isCallExpression(node) || calleeName(node) !== "route") return;
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    const prop = (key: string) => {
      const found = arg.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText() === key,
      );
      return found?.initializer;
    };
    routes.push({
      file: rel(file),
      line: lineOf(source, node),
      path: stringArg(prop("path")) ?? compact(prop("path")?.getText() ?? "?"),
      method: stringArg(prop("method")) ?? "?",
      handler: compact(prop("handler")?.getText() ?? "?"),
    });
  });
  return routes;
}

// ---------------------------------------------------------------- callers

const CALLER_GLOBS = [
  "app/**/*.{ts,tsx}",
  "components/**/*.{ts,tsx}",
  "lib/**/*.{ts,tsx}",
  "utils/**/*.{ts,tsx}",
  "tests/**/*.{ts,tsx}",
  "proxy.ts",
];

function callerFiles(): string[] {
  return sorted(
    CALLER_GLOBS.flatMap((pattern) =>
      globSync(pattern, { cwd: FRONTEND, absolute: true }),
    ),
  );
}

function callContext(file: string, text: string): CallSite["context"] {
  const path = rel(file);
  if (path.startsWith("frontend/tests/") || /\.test\.tsx?$/.test(path)) {
    return "test";
  }
  const hasClientDirective = text.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")
    );
  });
  if (hasClientDirective) return "client";
  return "server";
}

function readCallers(): Pick<
  Inventory,
  | "clientCalls"
  | "serverCalls"
  | "authHookCalls"
  | "nestedStorageReferences"
  | "externalCallers"
> {
  const clientCalls: CallSite[] = [];
  const serverCalls: CallSite[] = [];
  const authHookCalls: CallSite[] = [];
  const nested: Inventory["nestedStorageReferences"] = [];
  const external: Inventory["externalCallers"] = [];

  for (const file of callerFiles()) {
    const text = readFileSync(file, "utf8");
    const importsConvex = /from ["'](convex\/|@\/convex\/)/.test(text);
    const source = parse(file);
    const context = callContext(file, text);

    walk(source, (node) =>
      inspectCallerNode(node, {
        file,
        source,
        importsConvex,
        context,
        nested,
        clientCalls,
        authHookCalls,
        serverCalls,
      }),
    );

    for (const [pattern, service] of [
      [/ConvexHttpClient/, "frontend ConvexHttpClient"],
      [/CONVEX_SITE_URL|convex\.site/, "Convex HTTP site URL"],
    ] as const) {
      const index = text.search(pattern);
      if (index >= 0 && !importsConvexOnlyForTypes(text)) {
        external.push({
          file: rel(file),
          line: text.slice(0, index).split("\n").length,
          service,
          detail: compact(text.slice(index, index + 80).split("\n")[0] ?? ""),
        });
      }
    }
  }

  // Other services that reach Convex over HTTP.
  const serviceFiles = globSync(
    "backend/{media_service,discord-bot,image_processing_service}/{src,test}/**/*.ts",
    { cwd: REPO, absolute: true },
  ).sort();
  for (const file of serviceFiles) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      if (
        /CONVEX|convex|quick-share\/internal|discord\/user-config/.test(line)
      ) {
        external.push({
          file: rel(file),
          line: index + 1,
          service: rel(file).split("/")[1] ?? "backend",
          detail: compact(line).slice(0, 120),
        });
      }
    });
  }

  // Convex modules that call the outside world.
  for (const file of convexModules()) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      if (/\bfetch\(|process\.env\.[A-Z_]+/.test(line)) {
        external.push({
          file: rel(file),
          line: index + 1,
          service: "convex runtime",
          detail: compact(line).slice(0, 120),
        });
      }
    });
    const source = parse(file);
    walk(source, (node) => {
      if (ts.isIdentifier(node) && node.text.endsWith("StorageId")) {
        nested.push({
          file: rel(file),
          line: lineOf(source, node),
          identifier: node.text,
        });
      }
    });
  }

  return {
    clientCalls,
    serverCalls,
    authHookCalls,
    nestedStorageReferences: dedupeLocations(nested),
    externalCallers: external,
  };
}

type CallerNodeState = {
  file: string;
  source: ts.SourceFile;
  importsConvex: boolean;
  context: CallSite["context"];
  nested: Inventory["nestedStorageReferences"];
  clientCalls: CallSite[];
  authHookCalls: CallSite[];
  serverCalls: CallSite[];
};

function inspectCallerNode(node: ts.Node, state: CallerNodeState): void {
  if (ts.isIdentifier(node) && node.text.endsWith("StorageId")) {
    state.nested.push({
      file: rel(state.file),
      line: lineOf(state.source, node),
      identifier: node.text,
    });
  }
  if (!state.importsConvex || !ts.isCallExpression(node)) return;
  const name = calleeName(node);
  if (!name) return;
  const target = compact(node.arguments[0]?.getText() ?? "");
  const site: CallSite = {
    file: rel(state.file),
    line: lineOf(state.source, node),
    kind: name,
    target,
    context: state.context,
  };
  if (CLIENT_HOOKS.has(name) && ts.isIdentifier(node.expression)) {
    state.clientCalls.push(site);
    return;
  }
  if (AUTH_HOOKS.has(name) && ts.isIdentifier(node.expression)) {
    state.authHookCalls.push(site);
    return;
  }
  if (
    SERVER_METHODS.has(name) &&
    ts.isPropertyAccessExpression(node.expression) &&
    /^(api|internal)\./.test(target)
  ) {
    state.serverCalls.push(site);
  }
}

function importsConvexOnlyForTypes(text: string): boolean {
  return !/new ConvexHttpClient|CONVEX_SITE_URL|convex\.site/.test(text);
}

function dedupeLocations<T extends Location & { identifier: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.file}:${item.line}:${item.identifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readDeploymentReferences(): Inventory["deploymentReferences"] {
  const files = globSync(
    "{.github/workflows/*.yml,.forgejo/workflows/*.yml,frontend/Dockerfile,frontend/docker-entrypoint.sh,frontend/convex.json,frontend/package.json,package.json,scripts/*.mjs,lefthook.yml}",
    { cwd: REPO, absolute: true, dot: true },
  ).sort();
  const refs: Inventory["deploymentReferences"] = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (/convex/i.test(line)) {
          refs.push({
            file: rel(file),
            line: index + 1,
            detail: compact(line).slice(0, 140),
          });
        }
      });
  }
  return refs;
}

// ---------------------------------------------------------------- report

function buildInventory(): Inventory {
  const { tables, sharedValidatorAnyFields } = readSchema();
  const { functions, scheduledCalls } = readFunctions();
  const crons = readCrons();
  const httpRoutes = readHttpRoutes();
  const callers = readCallers();
  const deploymentReferences = readDeploymentReferences();

  const count = (calls: CallSite[], kind: string, context?: string) =>
    calls.filter((c) => c.kind === kind && (!context || c.context === context))
      .length;

  const schemaAny =
    sharedValidatorAnyFields.length +
    tables.reduce((sum, t) => sum + t.anyFields.length, 0);

  return {
    generatedFrom:
      "frontend/convex, frontend/{app,components,lib,utils,tests}, backend/*, CI",
    summary: {
      tables: tables.length,
      schemaAnyFields: schemaAny,
      schemaStorageFields: tables.reduce(
        (s, t) => s + t.storageFields.length,
        0,
      ),
      schemaIdReferences: tables.reduce((s, t) => s + t.idReferences.length, 0),
      indexes: tables.reduce((s, t) => s + t.indexes.length, 0),
      functions: functions.length,
      publicFunctions: functions.filter(
        (f) => !f.kind.startsWith("internal") && f.kind !== "httpAction",
      ).length,
      internalFunctions: functions.filter((f) => f.kind.startsWith("internal"))
        .length,
      crons: crons.length,
      httpRoutes: httpRoutes.length,
      scheduledCallSites: scheduledCalls.length,
      useQuery:
        count(callers.clientCalls, "useQuery", "client") +
        count(callers.clientCalls, "useQuery", "server"),
      useMutation:
        count(callers.clientCalls, "useMutation", "client") +
        count(callers.clientCalls, "useMutation", "server"),
      useAction:
        count(callers.clientCalls, "useAction", "client") +
        count(callers.clientCalls, "useAction", "server"),
      usePaginatedQuery:
        count(callers.clientCalls, "usePaginatedQuery", "client") +
        count(callers.clientCalls, "usePaginatedQuery", "server"),
      clientHookFiles: new Set(
        callers.clientCalls
          .filter((c) => c.context !== "test")
          .map((c) => c.file),
      ).size,
      serverCallSites: callers.serverCalls.filter((c) => c.context !== "test")
        .length,
      serverCallerFiles: new Set(
        callers.serverCalls
          .filter((c) => c.context !== "test")
          .map((c) => c.file),
      ).size,
      authHookCalls: callers.authHookCalls.length,
      nestedStorageReferences: callers.nestedStorageReferences.length,
      externalCallerLines: callers.externalCallers.length,
      deploymentReferenceLines: deploymentReferences.length,
    },
    tables,
    sharedValidatorAnyFields,
    functions,
    crons,
    httpRoutes,
    scheduledCalls,
    ...callers,
    deploymentReferences,
  };
}

function link(loc: Location): string {
  return `\`${loc.file}:${loc.line}\``;
}

function renderMarkdown(inv: Inventory): string {
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  push(
    "# Convex inventory",
    "",
    "Generated by `frontend/scripts/migration/convex-inventory.ts`. Do not edit by hand;",
    "run `pnpm --dir frontend run migration:inventory` and commit the result.",
    "",
    "## Summary",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    ...Object.entries(inv.summary).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Tables",
    "",
    "| Table | Fields | `v.any()` fields | `v.id()` references | `_storage` fields | Indexes |",
    "| --- | ---: | --- | --- | --- | --- |",
  );
  for (const t of inv.tables) {
    push(
      `| \`${t.name}\` | ${t.fields.length} | ${t.anyFields.join(", ") || "—"} | ${
        t.idReferences.map((r) => `${r.path} → ${r.table}`).join(", ") || "—"
      } | ${t.storageFields.join(", ") || "—"} | ${
        t.indexes.map((i) => `${i.name}(${i.fields.join(",")})`).join("<br>") ||
        "—"
      } |`,
    );
  }
  push(
    "",
    `Shared validators with \`v.any()\`: ${inv.sharedValidatorAnyFields.join(", ") || "none"}`,
    "",
    "## Crons",
    "",
    "| Name | Schedule | Target | Source |",
    "| --- | --- | --- | --- |",
    ...inv.crons.map(
      (c) => `| ${c.name} | ${c.schedule} | ${c.target} | ${link(c)} |`,
    ),
    "",
    "## HTTP routes",
    "",
    "| Method | Path | Handler | Source |",
    "| --- | --- | --- | --- |",
    ...inv.httpRoutes.map(
      (r) => `| ${r.method} | \`${r.path}\` | ${r.handler} | ${link(r)} |`,
    ),
    "",
    "## Scheduled function calls",
    "",
    "| Target | Delay | Source |",
    "| --- | --- | --- |",
    ...inv.scheduledCalls.map(
      (s) => `| ${s.target} | ${s.delay} | ${link(s)} |`,
    ),
    "",
    "## Convex functions",
    "",
    "| Function | Kind | Auth | Reads | Inserts | Storage | Schedules | Env | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inv.functions.map(
      (f) =>
        `| \`${f.module}.${f.name}\` | ${f.kind} | ${f.usesAuth ? "yes" : ""} | ${f.tablesRead.join(", ")} | ${f.tablesWritten.join(", ")} | ${f.storageOps.join(", ")} | ${f.scheduler.join(", ")} | ${f.envVars.join(", ")}${f.fetches ? " (fetch)" : ""} | ${link(f)} |`,
    ),
    "",
    "## Client hook calls",
    "",
    "| Hook | Function | Context | Source |",
    "| --- | --- | --- | --- |",
    ...inv.clientCalls.map(
      (c) => `| ${c.kind} | \`${c.target}\` | ${c.context} | ${link(c)} |`,
    ),
    "",
    "## Auth hook calls",
    "",
    ...inv.authHookCalls.map((c) => `- ${c.kind} at ${link(c)}`),
    "",
    "## Server-side calls",
    "",
    "| Method | Function | Context | Source |",
    "| --- | --- | --- | --- |",
    ...inv.serverCalls.map(
      (c) => `| ${c.kind} | \`${c.target}\` | ${c.context} | ${link(c)} |`,
    ),
    "",
    "## Storage identifiers outside the schema",
    "",
    "Identifiers ending in `StorageId`. Entries outside schema-level `_storage` fields",
    "(for example `imageStorageId` inside palette settings JSON) need importer rewrites.",
    "",
    ...summarizeIdentifiers(inv.nestedStorageReferences),
    "",
    "## External callers and Convex runtime egress",
    "",
    "| Service | Detail | Source |",
    "| --- | --- | --- |",
    ...inv.externalCallers.map(
      (e) => `| ${e.service} | ${escapeCell(e.detail)} | ${link(e)} |`,
    ),
    "",
    "## Deployment and configuration references",
    "",
    "| Detail | Source |",
    "| --- | --- |",
    ...inv.deploymentReferences.map(
      (d) => `| ${escapeCell(d.detail)} | ${link(d)} |`,
    ),
    "",
  );
  return out.join("\n");
}

function summarizeIdentifiers(
  refs: Inventory["nestedStorageReferences"],
): string[] {
  const byIdentifier = new Map<string, Set<string>>();
  for (const ref of refs) {
    const files = byIdentifier.get(ref.identifier) ?? new Set<string>();
    files.add(ref.file);
    byIdentifier.set(ref.identifier, files);
  }
  return [...byIdentifier.entries()]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(
      ([id, files]) =>
        `- \`${id}\`: ${[...files]
          .sort(compareCodeUnits)
          .map((f) => `\`${f}\``)
          .join(", ")}`,
    );
}

const inventory = buildInventory();
const json = `${JSON.stringify(inventory, null, 2)}\n`;
const markdown = renderMarkdown(inventory);

if (process.argv.includes("--check")) {
  const stale = [
    [OUT_JSON, json],
    [OUT_MD, markdown],
  ].filter(([file, content]) => {
    try {
      return readFileSync(file, "utf8") !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(
      `Convex inventory is stale: ${stale.map(([f]) => rel(f)).join(", ")}. Run pnpm --dir frontend run migration:inventory.`,
    );
    process.exit(1);
  }
  console.log("Convex inventory is current.");
} else {
  writeFileSync(OUT_JSON, json);
  writeFileSync(OUT_MD, markdown);
  console.log(JSON.stringify(inventory.summary, null, 2));
}
