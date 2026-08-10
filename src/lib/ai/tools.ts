import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hasPermission, type Permission } from "@/lib/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { reportService } from "@/services/report-service";
import { inventoryService } from "@/services/inventory-service";
import { saleService } from "@/services/sale-service";
import { productService } from "@/services/product-service";
import { customerService } from "@/services/customer-service";
import { supplierService } from "@/services/supplier-service";
import { purchaseService } from "@/services/purchase-service";
import { resolvePeriod } from "@/lib/report-periods";
import { linearForecast, computeReorder } from "@/lib/ai/forecast";
import type { TenantContext } from "@/lib/tenant";

/**
 * AI TOOL REGISTRY — the ONLY door between the model and the business.
 *
 * SECURITY DESIGN:
 *  1. The model never sees Prisma, SQL, or raw ids from other tenants.
 *     Every handler receives the SERVER-side TenantContext and calls the
 *     same services the UI uses — the model is just another (untrusted)
 *     client of the existing security architecture.
 *  2. Tool ARGUMENTS are attacker-controlled (prompt injection can make
 *     the model send anything). Every args object is validated with a
 *     Zod schema that simply has no businessId/tenant field to inject —
 *     unknown keys are stripped, so "businessId": "other-tenant" is
 *     discarded before the handler ever runs.
 *  3. Each tool declares the SAME permission the equivalent screen
 *     requires. A CASHIER chatting with the AI can see products, not
 *     the P&L.
 *  4. Every execution is audit-logged (ai.tool.<name>).
 */

const periodArg = z.object({
  period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
}).strip();

const searchArg = z.object({ query: z.string().trim().min(1).max(100) }).strip();
const emptyArg = z.object({}).strip();

interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  permission: Permission;
  schema: S;
  handler: (ctx: TenantContext, args: z.infer<S>) => Promise<unknown>;
}

// ToolDef<S> is invariant in S (S appears in both `schema` and, via
// z.infer<S>, the `handler` parameter), so a heterogeneous array can't be
// typed ToolDef<SomeConcreteSchema>[]. Each call site below is still fully
// checked against its own concrete schema; only the return type is erased
// to the common bound so TOOLS can hold every tool without `any`.
function tool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<z.ZodTypeAny> {
  return def as unknown as ToolDef<z.ZodTypeAny>;
}

// Truncate big tool results before they reach the context window
const MAX_RESULT_CHARS = 6000;

export const TOOLS: ToolDef<z.ZodTypeAny>[] = [
  tool({
    name: "getDashboardSummary",
    description: "Today's headline numbers: sales count, gross sales, profit, margin, refunds, best sellers, cash drawer by payment method.",
    permission: "reports:view",
    schema: emptyArg,
    handler: (ctx) => saleService.getTodayReport(ctx),
  }),
  tool({
    name: "getFinancialSummary",
    description: "Full financial statement for a period: revenue, net revenue, COGS, gross/net profit, margins, expenses, cash flow, tax collected, outstanding balances — with deltas vs the previous period.",
    permission: "reports:view",
    schema: periodArg,
    handler: (ctx, { period }) => reportService.getFinancialSummary(ctx, resolvePeriod(period)),
  }),
  tool({
    name: "getInventorySummary",
    description: "Inventory overview: product count, stock value at cost and retail, low-stock count, out-of-stock count.",
    permission: "inventory:view",
    schema: emptyArg,
    handler: (ctx) => inventoryService.getDashboardStats(ctx),
  }),
  tool({
    name: "getInventoryValue",
    description: "Current inventory valuation at cost and at retail, plus potential profit locked in stock.",
    permission: "inventory:view",
    schema: emptyArg,
    handler: async (ctx) => {
      const s = await inventoryService.getDashboardStats(ctx);
      return { atCost: s.costValue, atRetail: s.retailValue, potentialProfit: s.retailValue - s.costValue };
    },
  }),
  tool({
    name: "getSalesSummary",
    description: "Sales for a period: totals, count, refunds, by payment method and by employee.",
    permission: "reports:view",
    schema: periodArg,
    handler: async (ctx, { period }) => {
      const p = resolvePeriod(period);
      const [byMethod, byEmployee, refunds] = await Promise.all([
        reportService.getSalesByPaymentMethod(ctx, p),
        reportService.getSalesByEmployee(ctx, p),
        reportService.getRefundReport(ctx, p),
      ]);
      return { period: p.label, byMethod, byEmployee, refunds };
    },
  }),
  tool({
    name: "getCustomerSummary",
    description: "Profile and KPIs for one customer found by name: lifetime value, order count, AOV, outstanding balance, store credit, favorite products.",
    permission: "customers:manage",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const matches = await saleService.searchCustomers(ctx, query);
      if (matches.length === 0) throw new NotFoundError("Customer");
      const profile = await customerService.getProfile(ctx, matches[0].id);
      return { matchedName: matches[0].name, kpis: profile.kpis, favorites: profile.favorites };
    },
  }),
  tool({
    name: "getSupplierSummary",
    description: "Profile for one supplier found by name: open POs, products supplied with average/last cost, average lead time in days, last purchase date.",
    permission: "purchases:manage",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const suppliers = await supplierService.list(ctx, { q: query, page: 1, perPage: 1, deleted: false } as never);
      const first = suppliers.items[0];
      if (!first) throw new NotFoundError("Supplier");
      return supplierService.getProfile(ctx, first.id);
    },
  }),
  tool({
    name: "getProductInformation",
    description: "Details for one product by name, SKU or barcode: price, cost, stock, minimum stock, status, category, supplier.",
    permission: "products:view",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const { products } = await saleService.searchForPos(ctx, query);
      if (products.length === 0) throw new NotFoundError("Product");
      return productService.getById(ctx, products[0].id);
    },
  }),
  tool({
    name: "getTopProducts",
    description: "Best-selling products for a period with net units, revenue and snapshot profit.",
    permission: "reports:view",
    schema: periodArg,
    handler: (ctx, { period }) => reportService.getTopProducts(ctx, resolvePeriod(period), 10),
  }),
  tool({
    name: "getTopCustomers",
    description: "Top customers for a period by net revenue, with order counts and AOV.",
    permission: "reports:view",
    schema: periodArg,
    handler: (ctx, { period }) => reportService.getTopCustomers(ctx, resolvePeriod(period), 10),
  }),
  tool({
    name: "getTopSuppliers",
    description: "Top suppliers for a period by received stock value.",
    permission: "reports:view",
    schema: periodArg,
    handler: (ctx, { period }) => reportService.getTopSuppliers(ctx, resolvePeriod(period), 10),
  }),
  tool({
    name: "getLowStockProducts",
    description: "Products at or below their minimum stock threshold.",
    permission: "inventory:view",
    schema: emptyArg,
    handler: async (ctx) => {
      const list = await productService.list(ctx, {
        page: 1, perPage: 25, stock: "low", deleted: false, sortBy: "quantity", sortDir: "asc",
      } as never);
      return list.items.map((p) => ({ name: p.name, sku: p.sku, quantity: p.quantity, minimum: p.minimumStock }));
    },
  }),
  tool({
    name: "getDeadStock",
    description: "Products in stock with zero sales in 90 days, with the money tied up in them.",
    permission: "inventory:view",
    schema: emptyArg,
    handler: async (ctx) => (await inventoryService.getAnalytics(ctx)).deadStock,
  }),
  tool({
  name: "getInventoryTurnover",
  description: "30-day inventory turnover plus fast and slow movers.",
  permission: "inventory:view",
  schema: emptyArg,
  handler: async (ctx) => {
    const a = await inventoryService.getAnalytics(ctx);

    return {
      turnover: a.turnover,
      fastMovers: a.fastMoving,
      slowMovers: a.slowMoving,
    };
  },
}),
  tool({
    name: "getRevenueForecast",
    description: "Deterministic next-month revenue forecast from historical monthly net revenue (least squares). Includes confidence level and explanation. Present the numbers AS RETURNED — never adjust them.",
    permission: "reports:view",
    schema: emptyArg,
    handler: async (ctx) => {
      const trend = await reportService.getMonthlyNetRevenueSeries(ctx, 12);
      return linearForecast(trend.map((t) => t.netRevenue));
    },
  }),
  tool({
    name: "getExpenseSummary",
    description: "Expenses for a period, total and grouped by category.",
    permission: "expenses:manage",
    schema: periodArg,
    handler: async (ctx, { period }) => {
      const p = resolvePeriod(period);
      return reportService.getExpensesByCategory(ctx, p);
    },
  }),
  tool({
    name: "getReorderRecommendations",
    description: "Products that should be reordered, with reasons, suggested quantities (30-day cover), and the best supplier by cost and lead time.",
    permission: "purchases:manage",
    schema: emptyArg,
    handler: async (ctx) => {
      const velocity = await inventoryService.getSalesVelocity(ctx, 30);
      const recs = computeReorder(velocity.map((v) => ({
        name: v.name, quantity: v.quantity, minimumStock: v.minimumStock,
        soldInWindow: v.soldUnits, windowDays: 30,
      })));
      // Enrich the top recommendations with supplier intel (cost + lead time)
      const enriched = await Promise.all(recs.slice(0, 8).map(async (rec) => {
        const product = velocity.find((v) => v.name === rec.name);
        if (!product) return rec;
        const pricing = await purchaseService.getSupplierPricing(ctx, product.id);
        const best = pricing[0]; // cheapest first (lead time shown via supplier profile)
        return { ...rec, bestSupplier: best ? { name: best.supplier, lastCost: best.unitCost } : null };
      }));
      return enriched;
    },
  }),
  tool({
    name: "searchInvoices",
    description: "Find invoices by sale number or customer name; returns invoice numbers, totals and payment status.",
    permission: "invoices:manage",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const r = await saleService.list(ctx, { q: query, page: 1, perPage: 10, sortDir: "desc" } as never);
      return r.items.filter((s) => s.invoice).map((s) => ({
        invoice: `INV-${String(s.invoice!.invoiceNumber).padStart(5, "0")}`,
        sale: s.saleNumber, customer: s.customer?.name ?? "Walk-in",
        total: Number(s.total), paymentStatus: s.paymentStatus, date: s.createdAt,
      }));
    },
  }),
  tool({
    name: "searchSales",
    description: "Find sales by number or customer name; returns totals, status, items count.",
    permission: "sales:create",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const r = await saleService.list(ctx, { q: query, page: 1, perPage: 10, sortDir: "desc" } as never);
      return r.items.map((s) => ({
        sale: s.saleNumber, customer: s.customer?.name ?? "Walk-in", total: Number(s.total),
        status: s.status, paymentStatus: s.paymentStatus, date: s.createdAt,
      }));
    },
  }),
  tool({
    name: "searchProducts",
    description: "Search products by name, SKU or barcode; returns price, stock and status.",
    permission: "products:view",
    schema: searchArg,
    handler: async (ctx, { query }) => {
      const { products } = await saleService.searchForPos(ctx, query);
      return products;
    },
  }),
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** OpenAI-format tool definitions, filtered to what THIS role may use. */
export function toolDefinitionsFor(ctx: TenantContext) {
  return TOOLS.filter((t) => hasPermission(ctx.role, t.permission)).map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema),
  }));
}

// ---------- cache (cost control) ----------
// Per-instance TTL cache: within one chat session (one warm serverless
// instance) repeated tool calls with identical args are free. Cross-
// instance misses just re-run an indexed query — safe by construction.
const cache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Test-only: clears the module-level tool cache. Without this, tests that
 * run after another test has populated a cache key for the same
 * businessId+tool+args would silently hit stale data instead of exercising
 * the code under test.
 */
export function _clearToolCacheForTests(): void {
  cache.clear();
}

/**
 * Execute a tool call coming FROM THE MODEL. Validates permission,
 * validates args (stripping injected keys), caches, audit-logs.
 * Returns a JSON string ready for the model, truncated for cost control.
 */
export async function executeTool(ctx: TenantContext, name: string, rawArgs: unknown): Promise<string> {
  const def = byName.get(name);
  if (!def) return JSON.stringify({ error: `Unknown tool: ${name}` });

  if (!hasPermission(ctx.role, def.permission)) {
    throw new ForbiddenError(`Your role does not have access to ${name}.`);
  }

  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return JSON.stringify({
      error: "Invalid arguments.",
      details: parsed.error.issues.map((issue: { message: string }) => issue.message),
    });
  }

  const cacheKey = `${ctx.businessId}:${name}:${JSON.stringify(parsed.data)}`;
  const started = Date.now();
  const hit = cache.get(cacheKey);
  const cached = Boolean(hit && hit.expires > Date.now());

  let json: string;
  if (cached && hit) {
    json = hit.value;
  } else {
    try {
      const result = await def.handler(ctx, parsed.data);
      json = JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
      if (json.length > MAX_RESULT_CHARS) json = json.slice(0, MAX_RESULT_CHARS) + `…(truncated)`;
      cache.set(cacheKey, { value: json, expires: Date.now() + CACHE_TTL_MS });
    } catch (e) {
      // Log the real error server-side; never return internals (stack
      // traces, connection strings, hostnames) to the model or end user.
      logger.warn(`AI tool failed: ${name}`, { error: e instanceof Error ? e.message : e });
      return JSON.stringify({ error: "This tool failed to run. Please try again." });
    }
  }

  // AUDIT: every successful AI data access is logged, cache hit or not —
  // a cache hit still means the model read this tenant's data.
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId, userId: ctx.user.id,
      action: `ai.tool.${name}`, entity: "AiTool", entityId: null,
      metadata: { args: parsed.data as object, ms: Date.now() - started, cached },
    },
  });

  return json;
}

/** Minimal zod -> JSON Schema for our two arg shapes (enum + string). */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    const v = value as z.ZodTypeAny;
    if (v instanceof z.ZodEnum) properties[key] = { type: "string", enum: v.options };
    else if (v instanceof z.ZodDefault) {
      const inner = v.removeDefault();
      properties[key] = inner instanceof z.ZodEnum ? { type: "string", enum: inner.options } : { type: "string" };
    } else {
      properties[key] = { type: "string" };
      required.push(key);
    }
  }
  return { type: "object", properties, required, additionalProperties: false };
};
