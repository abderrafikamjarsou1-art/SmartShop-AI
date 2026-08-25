import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { reportPeriodSchema } from "@/lib/validation/expense";
import { reportService } from "@/services/report-service";
import { delta } from "@/lib/report-periods";
import { ok, fail, newRequestId } from "@/lib/api-response";

const dayName = (d: Date) => d.toLocaleString("en-US", { weekday: "short" });

/** current/0 -> 0 (not NaN/Infinity) — same "no basis" convention as delta(). */
function averageOrderValue(revenue: number, orderCount: number): number {
  return orderCount > 0 ? revenue / orderCount : 0;
}

/**
 * GET /api/reports/summary?preset=daily|weekly|monthly|quarterly|yearly|custom&from=&to=
 *
 * Period-scoped report data as JSON (the mobile screen; the web reports
 * page renders this same data as server-rendered markup). Composes
 * existing reportService methods — no duplicate aggregation logic:
 *  - getFinancialSummary(): sales/profit totals + previous-period deltas
 *    (same query as /api/reports/export's "financial-summary" and the web
 *    reports page's financial tab). Now also exposes `previousSummary`
 *    (additive) so this route can derive average-order-value deltas
 *    without re-querying.
 *  - getOrderKpis(): order count / distinct customer count / returned-sale
 *    count for a range — same COMPLETED/PARTIALLY_RETURNED/RETURNED
 *    eligibility as the revenue query, run once for the current period and
 *    once for the previous period (for deltas).
 *  - getTrends(): the same generate_series daily/weekly/monthly time
 *    series already used elsewhere (e.g. the home dashboard's monthly
 *    chart) — `weekly`/`daily`/`monthly` presets all resolve to a `day`
 *    bucket, so this doubles as the report's real 7-day (or period-long)
 *    daily revenue series with no holes on zero-sale days.
 *  - getTopProducts(): top sellers by revenue for the same period.
 *
 * Low stock and inventory valuation are deliberately NOT here — they're
 * point-in-time stock state, not period-scoped, and already served by
 * /api/inventory/dashboard and /api/products?stock=low.
 */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("reports:view");
    const input = zParse(reportPeriodSchema, Object.fromEntries(request.nextUrl.searchParams));
    const period = reportService.resolve(input);

    const [{ summary, previousSummary, deltas }, topProducts, currentKpis, previousKpis, trends] = await Promise.all([
      reportService.getFinancialSummary(ctx, period),
      reportService.getTopProducts(ctx, period, 10),
      reportService.getOrderKpis(ctx, period.from, period.to),
      reportService.getOrderKpis(ctx, period.prevFrom, period.prevTo),
      reportService.getTrends(ctx, period),
    ]);

    const currentAov = averageOrderValue(summary.netRevenue, currentKpis.orderCount);
    const previousAov = averageOrderValue(previousSummary.netRevenue, previousKpis.orderCount);

    return ok(
      {
        period: { label: period.label, from: period.from, to: period.to, preset: input.preset },
        summary,
        deltas: {
          ...deltas,
          orderCount: delta(currentKpis.orderCount, previousKpis.orderCount),
          averageOrderValue: delta(currentAov, previousAov),
          customerCount: delta(currentKpis.customerCount, previousKpis.customerCount),
          returnsCount: delta(currentKpis.returnsCount, previousKpis.returnsCount),
        },
        kpis: {
          orderCount: currentKpis.orderCount,
          averageOrderValue: currentAov,
          customerCount: currentKpis.customerCount,
          returnsCount: currentKpis.returnsCount,
        },
        dailySeries: trends.map((t) => ({
          date: t.bucket,
          day: dayName(new Date(t.bucket)),
          revenue: t.revenue,
        })),
        topProducts,
      },
      requestId
    );
  } catch (error) {
    return fail(error, requestId, "GET /api/reports/summary");
  }
}
