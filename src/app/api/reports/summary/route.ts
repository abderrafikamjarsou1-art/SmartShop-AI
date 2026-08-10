import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { reportPeriodSchema } from "@/lib/validation/expense";
import { reportService } from "@/services/report-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/reports/summary?preset=daily|weekly|monthly|quarterly|yearly|custom&from=&to=
 *
 * Period-scoped report data as JSON (the mobile screen; the web reports
 * page renders this same data as server-rendered markup). Composes two
 * existing reportService methods — no new aggregation logic:
 *  - getFinancialSummary(): sales/profit totals + previous-period deltas
 *    (same query as /api/reports/export's "financial-summary" and the web
 *    reports page's financial tab).
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

    const [{ summary, deltas }, topProducts] = await Promise.all([
      reportService.getFinancialSummary(ctx, period),
      reportService.getTopProducts(ctx, period, 10),
    ]);

    return ok(
      {
        period: { label: period.label, from: period.from, to: period.to, preset: input.preset },
        summary,
        deltas,
        topProducts,
      },
      requestId
    );
  } catch (error) {
    return fail(error, requestId, "GET /api/reports/summary");
  }
}
