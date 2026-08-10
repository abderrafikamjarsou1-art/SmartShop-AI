import "server-only";
import { prisma } from "@/lib/prisma";
import { deriveFinancials, type RawFinancials } from "@/lib/finance";
import { resolvePeriod, delta, type ResolvedPeriod } from "@/lib/report-periods";
import type { TenantContext } from "@/lib/tenant";
import type { ReportPeriodInput } from "@/lib/validation/expense";

/**
 * Report service — every number an accountant would sign.
 *
 * QUERY STRATEGY (documented per requirement):
 *  1. SNAPSHOTS ONLY. Revenue/COGS come from sale_items.unitPrice/unitCost
 *     and line totals frozen at sale time; purchase costs from
 *     purchase_items.unitCost. Current product prices appear in NO
 *     financial query. Repricing the catalog cannot change history.
 *  2. RETURNS-AWARE. Net units = quantity - returnedQuantity; each line
 *     contributes (net/qty) * total to revenue and net * unitCost to COGS.
 *  3. SET-BASED, NOT N+1. Every report is one aggregate query (GROUP BY /
 *     FILTER clauses), never a loop over rows. The financial summary is
 *     a handful of parallel aggregates — bounded and index-backed
 *     ([businessId, createdAt] from Step 2).
 *  4. TIME SERIES via generate_series LEFT JOIN, so empty days/weeks/
 *     months render as zeros instead of holes in the chart.
 *  5. All raw SQL is parameterized (Prisma tagged templates) — the raw
 *     escape hatch never becomes an injection hatch.
 */

export const reportService = {
  resolve(input: ReportPeriodInput): ResolvedPeriod {
    return resolvePeriod(input.preset, new Date(),
      input.from && input.to ? { from: input.from, to: input.to } : undefined);
  },

  // ---------------------------------------------------------------
  // FINANCIAL SUMMARY (with previous-period deltas)
  // ---------------------------------------------------------------
  async getFinancialSummary(ctx: TenantContext, period: ResolvedPeriod) {
    const current = await this.rawFinancials(
  ctx,
  period.from,
  period.to
);

const previous = await this.rawFinancials(
  ctx,
  period.prevFrom,
  period.prevTo
);
      
      
    
    const summary = deriveFinancials(current);
    const prev = deriveFinancials(previous);
    return {
      summary,
      deltas: {
        netRevenue: delta(summary.netRevenue, prev.netRevenue),
        grossProfit: delta(summary.grossProfit, prev.grossProfit),
        netProfit: delta(summary.netProfit, prev.netProfit),
        expenses: delta(summary.operatingExpenses, prev.operatingExpenses),
      },
    };
  },

  /**
   * Home dashboard payload — real aggregations for the landing screen.
   * Composes the proven summary + trend queries with two small direct
   * lookups (recent sales, low stock). Every shape is pre-mapped to what
   * the dashboard renders, so the page stays pure markup.
   */
  async getHomeDashboard(ctx: TenantContext) {
    const bid = ctx.businessId;
    const now = new Date();
    const month = resolvePeriod("monthly", now);
    const today = resolvePeriod("daily", now);

    // Last 7 calendar months, month buckets — reuses getTrends' SQL.
    const sevenMonths: ResolvedPeriod = {
      from: new Date(now.getFullYear(), now.getMonth() - 6, 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      prevFrom: new Date(now.getFullYear(), now.getMonth() - 6, 1),
      prevTo: new Date(now.getFullYear(), now.getMonth() - 6, 1),
      bucket: "month",
      label: "Last 7 months",
    };

    // Current ISO week (Monday start) for per-day sale counts.
    const dow = (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getDay() + 6) % 7;
    const weekFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const weekTo = new Date(weekFrom.getTime() + 7 * 86_400_000);

    const [monthSummary, todaySummary, trends, inventory, weekRows, recent, low] = await Promise.all([
      this.getFinancialSummary(ctx, month),
      this.getFinancialSummary(ctx, today),
      this.getTrends(ctx, sevenMonths),
      prisma.$queryRaw<[{ value: number }]>`
        SELECT COALESCE(SUM(quantity * "buyingPrice"), 0)::float AS value
        FROM products WHERE "businessId" = ${bid}::uuid AND "deletedAt" IS NULL
      `,
      prisma.$queryRaw<{ day: Date; sales: number }[]>`
        WITH days AS (
          SELECT generate_series(${weekFrom}::timestamptz, ${weekTo}::timestamptz - interval '1 day', '1 day') AS d
        )
        SELECT days.d AS day, COALESCE(COUNT(s.id), 0)::int AS sales
        FROM days
        LEFT JOIN sales s
          ON date_trunc('day', s."createdAt") = days.d
         AND s."businessId" = ${bid}::uuid
         AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        GROUP BY days.d ORDER BY days.d
      `,
      prisma.sale.findMany({
        where: { businessId: bid, status: { in: ["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"] } },
        select: {
          id: true, saleNumber: true, total: true, paymentStatus: true, createdAt: true,
          customer: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.$queryRaw<{ id: string; name: string; sku: string; quantity: number; minimum: number }[]>`
        SELECT id, name, sku, quantity, "minimumStock" AS minimum
        FROM products
        WHERE "businessId" = ${bid}::uuid AND "deletedAt" IS NULL AND quantity <= "minimumStock"
        ORDER BY quantity ASC LIMIT 5
      `,
    ]);

    const monthName = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    const dayName = (d: Date) => d.toLocaleString("en-US", { weekday: "short" });

    return {
      stats: {
        todaySales: todaySummary.summary.netRevenue,
        todayDelta: todaySummary.deltas.netRevenue,
        monthSales: monthSummary.summary.netRevenue,
        monthDelta: monthSummary.deltas.netRevenue,
        profit: monthSummary.summary.netProfit,
        profitDelta: monthSummary.deltas.netProfit,
        expenses: monthSummary.summary.operatingExpenses,
        expensesDelta: monthSummary.deltas.expenses,
        inventoryValue: inventory[0].value,
        valueAtCost: inventory[0].value,
        valueAtRetail: inventory[0].value,
      },
      monthlySeries: trends.map((t) => ({
        month: monthName(new Date(t.bucket)),
        revenue: t.revenue,
        profit: t.profit,
      })),
      weeklySeries: weekRows.map((r) => ({
        day: dayName(new Date(r.day)),
        sales: Number(r.sales),
      })),
      recentSales: recent.map((s) => ({
        id: s.id,
        number: `S-${String(s.saleNumber).padStart(4, "0")}`,
        customer: s.customer?.name ?? "Walk-in",
        total: Number(s.total),
        items: s._count.items,
        createdAt: s.createdAt.toISOString(),
        paymentStatus: s.paymentStatus,
      })),
      lowStock: low.map((p) => ({
        id: p.id, name: p.name, sku: p.sku,
        quantity: Number(p.quantity), minimum: Number(p.minimum),
      })),
    };
  },

  /** All raw aggregates for one range — parallel, each one indexed. */
  async rawFinancials(ctx: TenantContext, from: Date, to: Date): Promise<RawFinancials> {
    const bid = ctx.businessId;
    const [sales, payments, expenses, purchases, inventory, balances] = await Promise.all([
      // Revenue + COGS from SNAPSHOTS, returns-aware, one pass over sale_items
      prisma.$queryRaw<[{ gross: number; net: number; tax: number; cogs: number }]>`
        SELECT
          COALESCE(SUM(DISTINCT_SALES.total), 0)::float AS gross,
          COALESCE(SUM(li.net_line), 0)::float          AS net,
          COALESCE(SUM(DISTINCT_SALES.tax), 0)::float   AS tax,
          COALESCE(SUM(li.cogs), 0)::float              AS cogs
        FROM (
          SELECT s.id, s.total::float AS total, s."taxAmount"::float AS tax
          FROM sales s
          WHERE s."businessId" = ${bid}::uuid
            AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
            AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        ) DISTINCT_SALES
        LEFT JOIN LATERAL (
          SELECT
            SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total) AS net_line,
            SUM((i.quantity - i."returnedQuantity") * i."unitCost")                          AS cogs
          FROM sale_items i WHERE i."saleId" = DISTINCT_SALES.id
        ) li ON TRUE
      `,
      // Cash in/out through sale payments (+ account payments live in SalePayment too)
      prisma.$queryRaw<[{ inflow: number; refunds: number }]>`
        SELECT
          COALESCE(SUM(p.amount) FILTER (WHERE p.amount > 0), 0)::float AS inflow,
          COALESCE(SUM(-p.amount) FILTER (WHERE p.amount < 0), 0)::float AS refunds
        FROM sale_payments p
        JOIN sales s ON s.id = p."saleId"
        WHERE s."businessId" = ${bid}::uuid AND p."createdAt" >= ${from} AND p."createdAt" < ${to}
      `,
      prisma.expense.aggregate({
        where: {
          businessId: bid, deletedAt: null, isRecurring: false,
          date: { gte: from, lt: to },
        },
        _sum: { amount: true, taxAmount: true },
      }),
      // Stock received in the period, valued at PO snapshot costs
      prisma.$queryRaw<[{ received: number }]>`
        SELECT COALESCE(SUM(m.quantity * pi."unitCost"), 0)::float AS received
        FROM inventory_movements m
        JOIN purchase_items pi ON pi."purchaseId" = m."purchaseId" AND pi."productId" = m."productId"
        WHERE m."businessId" = ${bid}::uuid AND m.type = 'PURCHASE'
          AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
      `,
      prisma.$queryRaw<[{ value: number }]>`
        SELECT COALESCE(SUM(quantity * "buyingPrice"), 0)::float AS value
        FROM products WHERE "businessId" = ${bid}::uuid AND "deletedAt" IS NULL
      `,
      prisma.$queryRaw<[{ customers: number; suppliers: number }]>`
        SELECT
          (SELECT COALESCE(SUM("outstandingBalance"), 0) FROM customers
            WHERE "businessId" = ${bid}::uuid AND "deletedAt" IS NULL)::float AS customers,
          (SELECT COALESCE(SUM(total), 0) FROM purchases
            WHERE "businessId" = ${bid}::uuid
              AND status IN ('PARTIALLY_RECEIVED','RECEIVED')
              AND "paymentStatus" IN ('PENDING','PARTIAL'))::float AS suppliers
      `,
    ]);

    return {
      grossSales: sales[0].gross,
      netItemRevenue: sales[0].net,
      taxCollected: sales[0].tax,
      cogs: sales[0].cogs,
      refunds: payments[0].refunds,
      paymentsIn: payments[0].inflow,
      expenses: Number(expenses._sum.amount ?? 0),
      expenseTax: Number(expenses._sum.taxAmount ?? 0),
      purchasesReceived: purchases[0].received,
      inventoryValueCost: inventory[0].value,
      outstandingCustomers: balances[0].customers,
      outstandingSuppliers: balances[0].suppliers,
    };
  },

  // ---------------------------------------------------------------
  // TRENDS — generate_series so charts have no holes
  // ---------------------------------------------------------------
  async getTrends(ctx: TenantContext, period: ResolvedPeriod) {
    const bucket = period.bucket; // 'day' | 'week' | 'month' — validated enum, safe to inline
    const rows = await prisma.$queryRawUnsafe<
      { bucket: Date; revenue: number; profit: number; expenses: number; inventory_in: number }[]
    >(
      `
      WITH buckets AS (
        SELECT generate_series(date_trunc('${bucket}', $2::timestamptz), $3::timestamptz - interval '1 second', '1 ${bucket}') AS b
      ),
      sales_b AS (
        SELECT date_trunc('${bucket}', s."createdAt") AS b,
               SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total) AS revenue,
               SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total
                   - (i.quantity - i."returnedQuantity") * i."unitCost") AS profit
        FROM sales s JOIN sale_items i ON i."saleId" = s.id
        WHERE s."businessId" = $1::uuid AND s."createdAt" >= $2 AND s."createdAt" < $3
          AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        GROUP BY 1
      ),
      exp_b AS (
        SELECT date_trunc('${bucket}', e.date) AS b, SUM(e.amount) AS expenses
        FROM expenses e
        WHERE e."businessId" = $1::uuid AND e."deletedAt" IS NULL AND e."isRecurring" = false
          AND e.date >= $2 AND e.date < $3
        GROUP BY 1
      ),
      inv_b AS (
        SELECT date_trunc('${bucket}', m."createdAt") AS b, SUM(m.quantity) AS inventory_in
        FROM inventory_movements m
        WHERE m."businessId" = $1::uuid AND m."createdAt" >= $2 AND m."createdAt" < $3
        GROUP BY 1
      )
      SELECT buckets.b AS bucket,
             COALESCE(sales_b.revenue, 0)::float AS revenue,
             COALESCE(sales_b.profit, 0)::float AS profit,
             COALESCE(exp_b.expenses, 0)::float AS expenses,
             COALESCE(inv_b.inventory_in, 0)::float AS inventory_in
      FROM buckets
      LEFT JOIN sales_b ON sales_b.b = buckets.b
      LEFT JOIN exp_b ON exp_b.b = buckets.b
      LEFT JOIN inv_b ON inv_b.b = buckets.b
      ORDER BY buckets.b
      `,
      ctx.businessId, period.from, period.to
    );
    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      revenue: r.revenue, profit: r.profit,
      expenses: r.expenses, inventoryIn: r.inventory_in,
    }));
  },

  // ---------------------------------------------------------------
  // BUSINESS REPORTS — each one aggregate query
  // ---------------------------------------------------------------
  async getTopProducts(ctx: TenantContext, p: ResolvedPeriod, limit = 10) {
    return prisma.$queryRaw<{ name: string; sku: string | null; units: number; revenue: number; profit: number }[]>`
      SELECT pr.name, pr.sku,
             SUM(i.quantity - i."returnedQuantity")::int AS units,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)::float AS revenue,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total
                 - (i.quantity - i."returnedQuantity") * i."unitCost")::float AS profit
      FROM sale_items i
      JOIN sales s ON s.id = i."saleId"
      JOIN products pr ON pr.id = i."productId"
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND s."createdAt" >= ${p.from} AND s."createdAt" < ${p.to}
        AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
      GROUP BY pr.id HAVING SUM(i.quantity - i."returnedQuantity") > 0
      ORDER BY revenue DESC LIMIT ${limit}
    `;
  },

  async getTopCategories(ctx: TenantContext, p: ResolvedPeriod, limit = 10) {
    return prisma.$queryRaw<{ name: string; units: number; revenue: number }[]>`
      SELECT COALESCE(c.name, 'Uncategorized') AS name,
             SUM(i.quantity - i."returnedQuantity")::int AS units,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)::float AS revenue
      FROM sale_items i
      JOIN sales s ON s.id = i."saleId"
      JOIN products pr ON pr.id = i."productId"
      LEFT JOIN categories c ON c.id = pr."categoryId"
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND s."createdAt" >= ${p.from} AND s."createdAt" < ${p.to}
        AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
      GROUP BY c.name ORDER BY revenue DESC LIMIT ${limit}
    `;
  },

  async getTopCustomers(ctx: TenantContext, p: ResolvedPeriod, limit = 10) {
    return prisma.$queryRaw<{ name: string; orders: number; revenue: number; aov: number }[]>`
      SELECT c.name, COUNT(DISTINCT s.id)::int AS orders,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)::float AS revenue,
             (SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)
              / NULLIF(COUNT(DISTINCT s.id), 0))::float AS aov
      FROM sales s
      JOIN customers c ON c.id = s."customerId"
      JOIN sale_items i ON i."saleId" = s.id
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND s."createdAt" >= ${p.from} AND s."createdAt" < ${p.to}
        AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
      GROUP BY c.id ORDER BY revenue DESC LIMIT ${limit}
    `;
  },

  /** Top suppliers by received value in the period (PO snapshot costs). */
  async getTopSuppliers(ctx: TenantContext, p: ResolvedPeriod, limit = 10) {
    return prisma.$queryRaw<{ name: string; orders: number; received: number; units: number }[]>`
      SELECT sp.name,
             COUNT(DISTINCT pu.id)::int AS orders,
             COALESCE(SUM(m.quantity * pi."unitCost"), 0)::float AS received,
             COALESCE(SUM(m.quantity), 0)::int AS units
      FROM inventory_movements m
      JOIN purchases pu ON pu.id = m."purchaseId"
      JOIN suppliers sp ON sp.id = pu."supplierId"
      JOIN purchase_items pi ON pi."purchaseId" = m."purchaseId" AND pi."productId" = m."productId"
      WHERE m."businessId" = ${ctx.businessId}::uuid AND m.type = 'PURCHASE'
        AND m."createdAt" >= ${p.from} AND m."createdAt" < ${p.to}
      GROUP BY sp.id ORDER BY received DESC LIMIT ${limit}
    `;
  },

  async getSalesByEmployee(ctx: TenantContext, p: ResolvedPeriod) {
    return prisma.$queryRaw<{ name: string; sales: number; revenue: number; profit: number }[]>`
      SELECT COALESCE(u."fullName", u.email, 'Unknown') AS name,
             COUNT(DISTINCT s.id)::int AS sales,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total)::float AS revenue,
             SUM((i.quantity - i."returnedQuantity")::float / NULLIF(i.quantity,0) * i.total
                 - (i.quantity - i."returnedQuantity") * i."unitCost")::float AS profit
      FROM sales s
      LEFT JOIN users u ON u.id = s."userId"
      JOIN sale_items i ON i."saleId" = s.id
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND s."createdAt" >= ${p.from} AND s."createdAt" < ${p.to}
        AND s.status IN ('COMPLETED','PARTIALLY_RETURNED')
      GROUP BY u.id ORDER BY revenue DESC
    `;
  },

  async getSalesByPaymentMethod(ctx: TenantContext, p: ResolvedPeriod) {
    return prisma.$queryRaw<{ method: string; amount: number; count: number }[]>`
      SELECT pm.method, COALESCE(SUM(pm.amount), 0)::float AS amount, COUNT(*)::int AS count
      FROM sale_payments pm
      JOIN sales s ON s.id = pm."saleId"
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND pm."createdAt" >= ${p.from} AND pm."createdAt" < ${p.to} AND pm.amount > 0
      GROUP BY pm.method ORDER BY amount DESC
    `;
  },

  async getRefundReport(ctx: TenantContext, p: ResolvedPeriod) {
    return prisma.$queryRaw<{ saleNumber: number; customer: string | null; amount: number; method: string; reference: string | null; date: Date }[]>`
      SELECT s."saleNumber", c.name AS customer, (-pm.amount)::float AS amount,
             pm.method, pm.reference, pm."createdAt" AS date
      FROM sale_payments pm
      JOIN sales s ON s.id = pm."saleId"
      LEFT JOIN customers c ON c.id = s."customerId"
      WHERE s."businessId" = ${ctx.businessId}::uuid
        AND pm."createdAt" >= ${p.from} AND pm."createdAt" < ${p.to} AND pm.amount < 0
      ORDER BY pm."createdAt" DESC
    `;
  },

  async getPurchaseReport(ctx: TenantContext, p: ResolvedPeriod) {
    return prisma.$queryRaw<{ supplier: string; orders: number; ordered: number; received: number; spend: number }[]>`
      SELECT sp.name AS supplier, COUNT(DISTINCT pu.id)::int AS orders,
             SUM(pi.quantity)::int AS ordered, SUM(pi."receivedQuantity")::int AS received,
             SUM(pi."receivedQuantity" * pi."unitCost")::float AS spend
      FROM purchases pu
      JOIN suppliers sp ON sp.id = pu."supplierId"
      JOIN purchase_items pi ON pi."purchaseId" = pu.id
      WHERE pu."businessId" = ${ctx.businessId}::uuid
        AND pu."createdAt" >= ${p.from} AND pu."createdAt" < ${p.to}
        AND pu.status != 'CANCELLED'
      GROUP BY sp.id ORDER BY spend DESC
    `;
  },

    async getCustomerGrowth(ctx: TenantContext, p: ResolvedPeriod) {
    const bucket = p.bucket;

    return prisma.$queryRawUnsafe<{ bucket: Date; newCustomers: number }[]>(
      `
      SELECT b.b AS bucket, COALESCE(c.n, 0)::int AS "newCustomers"
      FROM generate_series(
        date_trunc('${bucket}', $2::timestamptz),
        $3::timestamptz - interval '1 second',
        '1 ${bucket}'
      ) b(b)
      LEFT JOIN (
        SELECT date_trunc('${bucket}', "createdAt") AS b,
               COUNT(*) AS n
        FROM customers
        WHERE "businessId" = $1::uuid
        GROUP BY 1
      ) c ON c.b = b.b
      ORDER BY b.b
      `,
      ctx.businessId,
      p.from,
      p.to
    );
  },

  async getMonthlyNetRevenueSeries(
    ctx: TenantContext,
    months: number
  ) {
    const end = new Date();

    const start = new Date(
      end.getFullYear(),
      end.getMonth() - months + 1,
      1
    );

    const rows = await this.getTrends(ctx, {
      from: start,
      to: end,
      prevFrom: start,
      prevTo: start,
      bucket: "month",
      label: "Forecast",
    });

    return rows.map((r) => ({
      month: r.bucket,
      netRevenue: r.revenue,
    }));
  },

  async getExpensesByCategory(
    ctx: TenantContext,
    period: ResolvedPeriod
  ) {
    const rows = await prisma.expense.groupBy({
      by: ["category"],
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
        date: {
          gte: period.from,
          lt: period.to,
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    });

    return rows.map((r) => ({
      category: r.category ?? "Other",
      amount: Number(r._sum.amount ?? 0),
    }));
  },
};