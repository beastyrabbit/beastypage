import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import yauzl from "yauzl";

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Read-only view of a Convex export ZIP:
 *   <table>/documents.jsonl, _storage/documents.jsonl, _storage/<id>[.<ext>],
 *   _tables/documents.jsonl, README.md, <table>/generated_schema.jsonl
 * Entries are streamed one at a time; the archive is never loaded whole.
 */
export class ConvexArchive {
  private constructor(
    private readonly zip: yauzl.ZipFile,
    private readonly entries: Map<string, yauzl.Entry>,
    readonly path: string,
  ) {}

  static async open(path: string): Promise<ConvexArchive> {
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
      yauzl.open(
        path,
        { lazyEntries: true, autoClose: false, strictFileNames: true },
        (error, file) => (error || !file ? reject(error) : resolve(file)),
      ),
    );
    const entries = new Map<string, yauzl.Entry>();
    await new Promise<void>((resolve, reject) => {
      zip.on("entry", (entry: yauzl.Entry) => {
        if (entries.has(entry.fileName)) {
          reject(new Error(`Duplicate archive entry ${entry.fileName}`));
          return;
        }
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.on("end", resolve);
      zip.on("error", reject);
      zip.readEntry();
    });
    return new ConvexArchive(zip, entries, path);
  }

  close(): void {
    this.zip.close();
  }

  /** Table names with a documents.jsonl, excluding Convex system folders. */
  tables(): string[] {
    return [...this.entries.keys()]
      .map((name) => /^([^/_][^/]*)\/documents\.jsonl$/.exec(name)?.[1])
      .filter((name): name is string => Boolean(name))
      .sort(compareCodeUnits);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Storage object entry for a `_storage` id, with or without an extension. */
  storageEntryName(storageId: string): string | null {
    const exact = `_storage/${storageId}`;
    if (this.entries.has(exact)) return exact;
    const prefix = `${exact}.`;
    const matches = [...this.entries.keys()].filter((name) =>
      name.startsWith(prefix),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  storageObjectCount(): number {
    return [...this.entries.keys()].filter(
      (name) =>
        name.startsWith("_storage/") && name !== "_storage/documents.jsonl",
    ).length;
  }

  async openStream(name: string): Promise<Readable> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Archive has no entry ${name}`);
    return new Promise((resolve, reject) =>
      this.zip.openReadStream(entry, (error, stream) =>
        error || !stream ? reject(error) : resolve(stream),
      ),
    );
  }

  async readBuffer(name: string, maxBytes: number): Promise<Buffer> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Archive has no entry ${name}`);
    if (entry.uncompressedSize > maxBytes) {
      throw new Error(
        `${name} is ${entry.uncompressedSize} bytes; limit ${maxBytes}`,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of await this.openStream(name))
      chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  /** Streams `<table>/documents.jsonl` one parsed line at a time. */
  async *documents(
    table: string,
  ): AsyncGenerator<
    { line: number; document: unknown } | { line: number; error: string }
  > {
    const name = `${table}/documents.jsonl`;
    if (!this.entries.has(name)) return;
    const lines = createInterface({
      input: await this.openStream(name),
      crlfDelay: Infinity,
    });
    let line = 0;
    for await (const text of lines) {
      line++;
      if (text.trim() === "") continue;
      try {
        yield { line, document: JSON.parse(text) };
      } catch (error) {
        yield {
          line,
          error: error instanceof Error ? error.message : "invalid JSON",
        };
      }
    }
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}
