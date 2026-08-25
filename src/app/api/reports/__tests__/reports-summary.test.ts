import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET /api/reports/summary. Mocks @/lib/tenant and
 * @/services/report-service — reportService's own aggregation logic is
 * already covered by its own service tests. This verifies auth
 * enforcement, real period-parsing (reportPeriodSchema), and that the
 * route composes exactly getFinancialSummary + getTopProducts.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/report-service", () => ({
  reportService: {
    resolve: vi.fn(),
    getFinancialSummary: vi.fn(),
    getTopProducts: vi.fn(),
    getOrderKpis: vi.fn(),
    getTrends: vi.fn(),
  },
}));

import { GET } from "../summary/route";
import { requireRole } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ctx = { businessId: "biz-1", role: "MANAGER" } as never;

function request(url: string) {
  return new NextRequest(url, { headers: { authorization: "Bearer test-token" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reports/summary", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await GET(request("http://localhost/api/reports/summary"));
    expect(response.status).toBe(401);
    expect(reportService.getFinancialSummary).not.toHaveBeenCalled();
  });

  it("rejects a role without reports:view (e.g. cashier)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());
    const response = await GET(request("http://localhost/api/reports/summary"));
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("reports:view");
  });

  it("resolves the daily preset and composes financial summary + top products", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    const period = { from: new Date("2026-01-01"), to: new Date("2026-01-02"), prevFrom: new Date(), prevTo: new Date(), bucket: "day", label: "Today" };
    vi.mocked(reportService.resolve).mockReturnValue(period as never);
    vi.mocked(reportService.getFinancialSummary).mockResolvedValue({
      summary: { netRevenue: 500, grossProfit: 200, netProfit: 150, operatingExpenses: 50 },
      previousSummary: { netRevenue: 400, grossProfit: 150, netProfit: 100, operatingExpenses: 40 },
      deltas: { netRevenue: 10, grossProfit: 5, netProfit: 5, expenses: -2 },
    } as never);
    vi.mocked(reportService.getTopProducts).mockResolvedValue([
      { name: "Cable", sku: "C1", units: 10, revenue: 300, profit: 100 },
    ] as never);
    vi.mocked(reportService.getOrderKpis).mockResolvedValue({ orderCount: 5, customerCount: 4, returnsCount: 1 } as never);
    vi.mocked(reportService.getTrends).mockResolvedValue([
      { bucket: "2026-01-01T00:00:00.000Z", revenue: 500, profit: 200, expenses: 0, inventoryIn: 0 },
    ] as never);

    const response = await GET(request("http://localhost/api/reports/summary?preset=daily"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary.netRevenue).toBe(500);
    expect(body.data.topProducts).toHaveLength(1);
    expect(body.data.period.label).toBe("Today");
    expect(body.data.kpis.orderCount).toBe(5);
    expect(body.data.kpis.customerCount).toBe(4);
    expect(body.data.kpis.returnsCount).toBe(1);
    expect(body.data.kpis.averageOrderValue).toBe(100);
    expect(body.data.dailySeries).toHaveLength(1);
    expect(reportService.resolve).toHaveBeenCalledWith(expect.objectContaining({ preset: "daily" }));
    expect(reportService.getFinancialSummary).toHaveBeenCalledWith(ctx, period);
    expect(reportService.getTopProducts).toHaveBeenCalledWith(ctx, period, 10);
    expect(reportService.getOrderKpis).toHaveBeenCalledWith(ctx, period.from, period.to);
    expect(reportService.getOrderKpis).toHaveBeenCalledWith(ctx, period.prevFrom, period.prevTo);
  });

  it("accepts a custom range with from/to", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(reportService.resolve).mockReturnValue({
      from: new Date(), to: new Date(), prevFrom: new Date(), prevTo: new Date(), bucket: "day", label: "",
    } as never);
    vi.mocked(reportService.getFinancialSummary).mockResolvedValue({
      summary: { netRevenue: 0, grossProfit: 0, netProfit: 0, operatingExpenses: 0 },
      previousSummary: { netRevenue: 0, grossProfit: 0, netProfit: 0, operatingExpenses: 0 },
      deltas: {},
    } as never);
    vi.mocked(reportService.getTopProducts).mockResolvedValue([] as never);
    vi.mocked(reportService.getOrderKpis).mockResolvedValue({ orderCount: 0, customerCount: 0, returnsCount: 0 } as never);
    vi.mocked(reportService.getTrends).mockResolvedValue([] as never);

    await GET(request("http://localhost/api/reports/summary?preset=custom&from=2026-01-01&to=2026-01-31"));

    expect(reportService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "custom", from: new Date("2026-01-01"), to: new Date("2026-01-31") })
    );
  });

  it("rejects a custom preset missing from/to with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await GET(request("http://localhost/api/reports/summary?preset=custom"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(reportService.getFinancialSummary).not.toHaveBeenCalled();
  });
});
