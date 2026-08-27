import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer test for GET /api/dashboard. Mocks @/lib/tenant,
 * @/services/report-service and @/services/sale-service — all three
 * service methods this route composes are already covered by their own
 * service test suites. This file verifies auth enforcement, the exact
 * composition (which services are called with what), and response shaping.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireBusiness: vi.fn() }));
vi.mock("@/services/report-service", () => ({
  reportService: { resolve: vi.fn(), getHomeDashboard: vi.fn(), getTopProducts: vi.fn() },
}));
vi.mock("@/services/sale-service", () => ({
  saleService: { getTodayReport: vi.fn() },
}));

import { GET } from "../route";
import { requireBusiness } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { saleService } from "@/services/sale-service";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1", name: "Shop", currency: "MAD" },
  role: "CASHIER",
  businessId: "biz-1",
} as never;

const homePayload = {
  stats: { todaySales: 100, monthSales: 2000, profit: 500, expenses: 200, inventoryValue: 5000 },
  monthlySeries: [{ month: "Jan", revenue: 1000, profit: 200 }],
  weeklySeries: [{ day: "Mon", sales: 3 }],
  recentSales: [{ id: "s1", number: "S-0001", customerId: null, customer: "Walk-in", total: 50, items: 2, createdAt: "2026-01-01T00:00:00.000Z", paymentStatus: "PAID" }],
  lowStock: [{ id: "p1", name: "Cable", sku: "C1", quantity: 2, minimum: 5 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/dashboard", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(reportService.getHomeDashboard).not.toHaveBeenCalled();
  });

  it("rejects a user with no business (onboarding state)", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new NotFoundError("Business"));

    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("composes home dashboard + top products + today's order count for the resolved tenant", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    const period = { from: new Date(), to: new Date(), prevFrom: new Date(), prevTo: new Date(), bucket: "month", label: "monthly" };
    vi.mocked(reportService.resolve).mockReturnValue(period as never);
    vi.mocked(reportService.getHomeDashboard).mockResolvedValue(homePayload as never);
    vi.mocked(reportService.getTopProducts).mockResolvedValue([
      { name: "Cable", sku: "C1", units: 40, revenue: 1200, profit: 300 },
    ] as never);
    vi.mocked(saleService.getTodayReport).mockResolvedValue({ salesCount: 7 } as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      ...homePayload,
      topProducts: [{ name: "Cable", sku: "C1", units: 40, revenue: 1200, profit: 300 }],
      todayOrderCount: 7,
      currency: "MAD",
      businessName: "Shop",
    });
    expect(reportService.resolve).toHaveBeenCalledWith({ preset: "monthly" });
    expect(reportService.getHomeDashboard).toHaveBeenCalledWith(ctx);
    expect(reportService.getTopProducts).toHaveBeenCalledWith(ctx, period, 5);
    expect(saleService.getTodayReport).toHaveBeenCalledWith(ctx);
  });

  it("returns real empty arrays (not fabricated data) when the tenant has no activity yet", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(reportService.resolve).mockReturnValue({} as never);
    vi.mocked(reportService.getHomeDashboard).mockResolvedValue({
      stats: { todaySales: 0, monthSales: 0, profit: 0, expenses: 0, inventoryValue: 0 },
      monthlySeries: [],
      weeklySeries: [],
      recentSales: [],
      lowStock: [],
    } as never);
    vi.mocked(reportService.getTopProducts).mockResolvedValue([] as never);
    vi.mocked(saleService.getTodayReport).mockResolvedValue({ salesCount: 0 } as never);

    const response = await GET();
    const body = await response.json();

    expect(body.data.recentSales).toEqual([]);
    expect(body.data.topProducts).toEqual([]);
    expect(body.data.todayOrderCount).toBe(0);
  });
});
