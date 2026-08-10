import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * AI security & correctness tests.
 * The attack surface is the TOOL layer (the model itself is untrusted by
 * design), so that's what we test: permissions, tenant isolation,
 * argument injection, and the deterministic math.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));

// Mock every service the registry touches so tools are tested in isolation
const getTodayReport = vi.fn().mockResolvedValue({ salesCount: 3, profit: 120 });
const getFinancialSummary = vi.fn().mockResolvedValue({ summary: { netRevenue: 1000 } });
vi.mock("@/services/sale-service", () => ({
  saleService: {
    getTodayReport: (...a: unknown[]) => getTodayReport(...a),
    searchForPos: vi.fn().mockResolvedValue({ products: [] }),
    searchCustomers: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue({ items: [] }),
  },
}));
vi.mock("@/services/report-service", () => ({
  reportService: {
    getFinancialSummary: (...a: unknown[]) => getFinancialSummary(...a),
    getTopProducts: vi.fn().mockResolvedValue([]),
    getTopCustomers: vi.fn().mockResolvedValue([]),
    getTopSuppliers: vi.fn().mockResolvedValue([]),
    getSalesByPaymentMethod: vi.fn().mockResolvedValue([]),
    getSalesByEmployee: vi.fn().mockResolvedValue([]),
    getRefundReport: vi.fn().mockResolvedValue([]),
    getMonthlyNetRevenueSeries: vi.fn().mockResolvedValue([]),
    getExpensesByCategory: vi.fn().mockResolvedValue({ total: 0 }),
  },
}));
vi.mock("@/services/inventory-service", () => ({
  inventoryService: {
    getDashboardStats: vi.fn().mockResolvedValue({ valueAtCost: 100, valueAtRetail: 150 }),
    getAnalytics: vi.fn().mockResolvedValue({ deadStock: [], turnover: 1, fastMovers: [], slowMovers: [] }),
    getSalesVelocity: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/services/product-service", () => ({ productService: { list: vi.fn().mockResolvedValue({ items: [] }), getById: vi.fn() } }));
vi.mock("@/services/customer-service", () => ({ customerService: { getProfile: vi.fn() } }));
vi.mock("@/services/supplier-service", () => ({ supplierService: { list: vi.fn().mockResolvedValue({ items: [] }), getProfile: vi.fn() } }));
vi.mock("@/services/purchase-service", () => ({ purchaseService: { getSupplierPricing: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/report-periods", () => ({
  resolvePeriod: vi.fn((p: string) => ({ from: new Date(0), to: new Date(), label: p })),
}));

import { executeTool, toolDefinitionsFor, TOOLS, _clearToolCacheForTests } from "@/lib/ai/tools";
import { linearForecast, computeReorder } from "@/lib/ai/forecast";
import { ForbiddenError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

const owner = { businessId: "biz-1", role: "OWNER", user: { id: "u1" }, business: { id: "biz-1", currency: "MAD", name: "Shop" } } as unknown as TenantContext;
const cashier = { ...owner, role: "CASHIER" } as TenantContext;

beforeEach(() => {
  vi.clearAllMocks();
  // The tool cache is a module-level singleton keyed by businessId+tool+args,
  // so without clearing it here, a call in one test can serve a stale cache
  // hit to the next test that exercises the same tool with the same args.
  _clearToolCacheForTests();
});

describe("tool registry — permissions", () => {
  it("every tool declares a permission", () => {
    for (const t of TOOLS) expect(t.permission).toBeTruthy();
  });

  it("a CASHIER cannot call financial tools", async () => {
    await expect(executeTool(cashier, "getFinancialSummary", {})).rejects.toThrow(ForbiddenError);
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it("a CASHIER's tool definitions exclude reports tools entirely", () => {
    const names = toolDefinitionsFor(cashier).map((t) => t.name);
    expect(names).not.toContain("getFinancialSummary");
    expect(names).toContain("searchProducts"); // products:view is allowed
  });

  it("an OWNER can call financial tools", async () => {
    const result = await executeTool(owner, "getFinancialSummary", { period: "monthly" });
    expect(JSON.parse(result)).toMatchObject({ summary: { netRevenue: 1000 } });
  });
});

describe("tool registry — tenant isolation & prompt injection", () => {
  it("handlers receive the SERVER-side ctx — injected businessId is stripped", async () => {
    await executeTool(owner, "getDashboardSummary", {
      businessId: "victim-tenant",             // injected by a hostile prompt
      ctx: { businessId: "victim-tenant" },    // nice try
    });
    // Handler was called with OUR ctx, and the injected keys never reached it
    expect(getTodayReport).toHaveBeenCalledWith(owner);
  });

  it("period arg injection can't smuggle arbitrary values (enum-validated)", async () => {
    const result = await executeTool(owner, "getFinancialSummary", { period: "'; DROP TABLE sales;--" });
    expect(JSON.parse(result)).toHaveProperty("error", "Invalid arguments.");
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it("unknown tools are refused without executing anything", async () => {
    const result = await executeTool(owner, "dropDatabase", {});
    expect(JSON.parse(result).error).toMatch(/Unknown tool/);
  });

  it("tool errors return a safe message, never the raw exception", async () => {
    getTodayReport.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const result = await executeTool(owner, "getDashboardSummary", {});
    const parsed = JSON.parse(result);
    // Regression: executeTool used to return e.message verbatim, which
    // could leak internal details (hostnames, connection strings) straight
    // into the model's context. It must always return the same generic,
    // user-safe string — the real message only ever reaches logger.warn.
    expect(parsed.error).toBe("This tool failed to run. Please try again.");
    expect(result).not.toContain("10.0.0.5");
    expect(result).not.toContain("ECONNREFUSED");
  });

  it("every successful call is audit-logged with ai.tool.* action", async () => {
    const { prisma } = await import("@/lib/prisma");
    await executeTool(owner, "getDashboardSummary", {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai.tool.getDashboardSummary", metadata: expect.objectContaining({ cached: false }) }),
      })
    );
  });

  it("caches repeated identical calls (cost control)", async () => {
    await executeTool(owner, "getDashboardSummary", {});
    await executeTool(owner, "getDashboardSummary", {});
    expect(getTodayReport).toHaveBeenCalledTimes(1);
  });

  it("regression: a cache hit is still audit-logged", async () => {
    const { prisma } = await import("@/lib/prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditCreate = (prisma as any).auditLog.create;

    await executeTool(owner, "getDashboardSummary", {}); // fresh: caches the result
    await executeTool(owner, "getDashboardSummary", {}); // cache hit

    // Both calls read this tenant's data and both must be audited — the
    // audit log used to sit after the cache's early return, so a repeated
    // identical call was silently unaudited despite the module's own doc
    // comment claiming "every execution is audit-logged".
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai.tool.getDashboardSummary", metadata: expect.objectContaining({ cached: true }) }),
      })
    );
  });
});

describe("linearForecast — deterministic, honest", () => {
  it("refuses with fewer than 3 periods instead of guessing", () => {
    const r = linearForecast([100, 200]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at least 3/);
  });

  it("perfect linear growth -> exact forecast, high-ish R²", () => {
    const r = linearForecast([100, 200, 300, 400, 500, 600]);
    expect(r.ok).toBe(true);
    expect(r.nextPeriod).toBe(700);
    expect(r.r2).toBe(1);
    expect(r.confidence).toBe("high");
  });

  it("noisy data lowers confidence and says so", () => {
    const r = linearForecast([100, 900, 150, 800, 120]);
    expect(r.ok).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.confidenceExplanation).toMatch(/rough direction/i);
  });

  it("is deterministic: same input, same output", () => {
    const a = linearForecast([120, 140, 160, 155, 180]);
    const b = linearForecast([120, 140, 160, 155, 180]);
    expect(a).toEqual(b);
  });

  it("never forecasts negative revenue", () => {
    const r = linearForecast([300, 200, 100]);
    expect(r.nextPeriod).toBeGreaterThanOrEqual(0);
  });
});

describe("computeReorder", () => {
  it("recommends when cover is below target, with an explanation", () => {
    const recs = computeReorder([
      { name: "Cable", quantity: 10, minimumStock: 5, soldInWindow: 60, windowDays: 30 }, // 2/day -> 5 days cover
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0].daysOfCover).toBe(5);
    expect(recs[0].suggestedQuantity).toBe(50); // to 30 days: 60 target - 10 stock
    expect(recs[0].reason).toMatch(/covers only 5 days/);
  });

  it("skips healthy products and products with no sales above minimum", () => {
    const recs = computeReorder([
      { name: "Healthy", quantity: 100, minimumStock: 5, soldInWindow: 30, windowDays: 30 },
      { name: "NoSales", quantity: 50, minimumStock: 5, soldInWindow: 0, windowDays: 30 },
    ]);
    expect(recs).toHaveLength(0);
  });

  it("flags below-minimum even without sales velocity", () => {
    const recs = computeReorder([
      { name: "BelowMin", quantity: 2, minimumStock: 10, soldInWindow: 0, windowDays: 30 },
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0].reason).toMatch(/below the minimum/);
  });
});
