// =====================================================
// tests/concurrency.test.ts — race-condition proofs
// Runs against a REAL local Postgres (docker) — these bugs
// don't reproduce against mocks by definition.
//   docker run -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres:16
//   DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/postgres
// =====================================================
import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
const runIf = process.env.DATABASE_URL_TEST ? describe : describe.skip;

runIf("concurrency invariants (real Postgres)", () => {
  let businessId: string, productId: string;

  beforeAll(async () => {
    // minimal seed: one business, one product with quantity 5
    const business = await prisma.business.create({ data: { name: "Race Test Shop" } });
    businessId = business.id;
    const product = await prisma.product.create({
      data: { businessId, name: "Contested Item", buyingPrice: 10, sellingPrice: 20, quantity: 5 },
    });
    productId = product.id;
  });

  it("STOCK GUARD: 10 concurrent buyers of 1 unit each, stock 5 -> exactly 5 succeed", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        prisma.product.updateMany({
          where: { id: productId, quantity: { gte: 1 } },
          data: { quantity: { decrement: 1 } },
        })
      )
    );
    const succeeded = attempts.filter(
      (r) => r.status === "fulfilled" && (r.value as { count: number }).count === 1
    ).length;

    const final = await prisma.product.findUnique({ where: { id: productId } });
    expect(succeeded).toBe(5);
    expect(final!.quantity).toBe(0); // NEVER negative — the invariant
  });

  it("IDEMPOTENCY: 5 identical clientRef inserts -> exactly 1 row", async () => {
    const clientRef = crypto.randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        prisma.purchaseReceipt.create({
          data: {
            businessId,
            purchaseId: crypto.randomUUID(), // FK relaxed for the isolated test schema
            clientRef, lines: [],
          },
        }).catch((e) => { if (e.code !== "P2002") throw e; return "duplicate"; })
      )
    );
    const created = results.filter((r) => r.status === "fulfilled" && r.value !== "duplicate");
    expect(created.length).toBe(1);
  });

  it("SEQUENCES: 20 parallel saleNumber allocations produce 20 distinct numbers", async () => {
    // Simulates the max+1-inside-tx pattern under contention with retry
    const allocate = async (): Promise<number> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await prisma.$transaction(async (tx) => {
            const last = await tx.sale.findFirst({
              where: { businessId }, orderBy: { saleNumber: "desc" }, select: { saleNumber: true },
            });
            const saleNumber = (last?.saleNumber ?? 0) + 1;
            await tx.sale.create({
              data: { businessId, saleNumber, subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, clientRef: crypto.randomUUID() },
            });
            return saleNumber;
          }, { isolationLevel: "Serializable" });
        } catch (e: unknown) {
          const code = (e as { code?: string }).code;
          if (code !== "P2034" && code !== "P2002") throw e;
        }
      }
      throw new Error("exhausted retries");
    };

    const numbers = await Promise.all(Array.from({ length: 20 }, allocate));
    expect(new Set(numbers).size).toBe(20); // all distinct, no gap-free guarantee needed
  });
});

// =====================================================
// STRESS: k6 script (load/pos-search.js) — run separately
// =====================================================
// import http from "k6/http";
// export const options = { vus: 50, duration: "1m",
//   thresholds: { http_req_duration: ["p(95)<400"] } };
// export default function () {
//   http.get(`${__ENV.BASE_URL}/products?q=cable`, {
//     headers: { Cookie: __ENV.SESSION_COOKIE } });
// }
