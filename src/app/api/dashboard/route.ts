import { requireBusiness } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { saleService } from "@/services/sale-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/dashboard — the mobile home screen's data, composed entirely
 * from existing, already-tested service methods (no new business logic):
 *  - reportService.getHomeDashboard(): stats w/ period deltas, monthly
 *    revenue/profit series, this-week sales-per-day series, recent sales,
 *    low stock — the exact same query the web dashboard page uses.
 *  - reportService.getTopProducts(): monthly top sellers by revenue (the
 *    web dashboard doesn't show this section; the mobile one does).
 *  - saleService.getTodayReport(): today's order count (salesCount) —
 *    the one number getHomeDashboard doesn't already carry.
 *
 * Permission: requireBusiness() only, matching the web dashboard page
 * exactly (src/app/(dashboard)/dashboard/page.tsx) — every authenticated
 * tenant member sees the dashboard regardless of role, it's not a
 * restricted report.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireBusiness();
    const period = reportService.resolve({ preset: "monthly" });

    const [home, topProducts, todayReport] = await Promise.all([
      reportService.getHomeDashboard(ctx),
      reportService.getTopProducts(ctx, period, 5),
      saleService.getTodayReport(ctx),
    ]);

    return ok(
      {
        ...home,
        topProducts,
        todayOrderCount: todayReport.salesCount,
        currency: ctx.business.currency,
      },
      requestId
    );
  } catch (error) {
    return fail(error, requestId, "GET /api/dashboard");
  }
}
