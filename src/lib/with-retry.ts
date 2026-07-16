// =====================================================
// fixes/with-retry.ts  ->  src/lib/with-retry.ts
// =====================================================
import { Prisma } from "@prisma/client";

/**
 * Retry wrapper for transactions that can fail under contention:
 *  - P2034: Serializable transaction aborted (two POS terminals colliding)
 *  - P2002 on our sequence backstops (saleNumber/invoiceNumber/purchaseNumber)
 * Retries with small jitter; anything else rethrows immediately.
 *
 * Usage (sale-service):
 *   return withRetry(() => prisma.$transaction(async (tx) => {...},
 *     { isolationLevel: "Serializable" }));
 */
const RETRYABLE_UNIQUE_TARGETS = ["saleNumber", "invoiceNumber", "purchaseNumber"];

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          (e.code === "P2002" &&
            RETRYABLE_UNIQUE_TARGETS.some((t) => String(e.meta?.target ?? "").includes(t))));
      if (!retryable) throw e;
      lastError = e;
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 120 * (i + 1)));
    }
  }
  throw lastError;
}
