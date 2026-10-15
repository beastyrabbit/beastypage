import type { Database } from "./pool";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Isolation = "read committed" | "repeatable read" | "serializable";

// serialization_failure, deadlock_detected
const RETRYABLE = new Set(["40001", "40P01"]);

function pgCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: { code?: unknown } }).cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

/**
 * Runs `work` in one transaction (ADR §8). Serializable transactions are
 * retried a bounded number of times on serialization failures or deadlocks;
 * `work` must therefore be free of side effects outside the database.
 */
export async function withTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
  options: { isolation?: Isolation; retries?: number } = {},
): Promise<T> {
  const isolationLevel = options.isolation ?? "read committed";
  const retries =
    options.retries ?? (isolationLevel === "serializable" ? 3 : 0);
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(work, { isolationLevel });
    } catch (error) {
      const code = pgCode(error);
      if (attempt >= retries || !code || !RETRYABLE.has(code)) throw error;
      await new Promise((done) =>
        setTimeout(done, 10 * 2 ** attempt + Math.random() * 10),
      );
    }
  }
}
