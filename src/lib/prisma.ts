import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton — prevents exhausting the connection pool during
 * Next.js hot reloads in development (each reload would otherwise
 * create a new client).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
    // Prisma's interactive-transaction default (maxWait 2s, timeout 5s) was
    // observed rolling back real multi-statement writes (product/sale/purchase
    // creation, each 3-5 sequential queries) under normal network latency to
    // a remote pooled Postgres connection — well within realistic production
    // conditions, not just this environment. Widened with real headroom;
    // still hard limits, not a substitute for keeping transactions short.
    transactionOptions: {
      maxWait: 10_000,
      timeout: 20_000,
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
