import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for /api/inventory/{dashboard,movements,movements/options}.
 * Mocks @/lib/tenant and @/services/inventory-service — inventoryService's
 * own logic is already covered by src/services/__tests__/inventory-service.test.ts.
 * These tests verify auth enforcement, real Zod validation, correct service
 * calls, and response shaping only.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/inventory-service", () => ({
  inventoryService: { getDashboardStats: vi.fn(), listMovements: vi.fn(), getLedgerFilterOptions: vi.fn() },
}));

import { GET as getDashboard } from "../dashboard/route";
import { GET as getMovements } from "../movements/route";
import { GET as getMovementOptions } from "../movements/options/route";
import { requireRole } from "@/lib/tenant";
import { inventoryService } from "@/services/inventory-service";
import { UnauthorizedError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

function request(url: string) {
  return new NextRequest(url, { headers: { authorization: "Bearer test-token" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/inventory/dashboard", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await getDashboard();
    expect(response.status).toBe(401);
    expect(inventoryService.getDashboardStats).not.toHaveBeenCalled();
  });

  it("returns stats for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(inventoryService.getDashboardStats).mockResolvedValue({
      totalProducts: 12,
      costValue: 1000,
      retailValue: 1800,
      outOfStockCount: 2,
      lowStockCount: 3,
      recentAdjustments: [],
    } as never);

    const response = await getDashboard();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.lowStockCount).toBe(3);
    expect(requireRole).toHaveBeenCalledWith("inventory:view");
    expect(inventoryService.getDashboardStats).toHaveBeenCalledWith(ctx);
  });
});

describe("GET /api/inventory/movements", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await getMovements(request("http://localhost/api/inventory/movements"));
    expect(response.status).toBe(401);
    expect(inventoryService.listMovements).not.toHaveBeenCalled();
  });

  it("lists movements with search, filters and pagination applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(inventoryService.listMovements).mockResolvedValue({
      items: [{ id: "m1" }],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never);

    const response = await getMovements(
      request("http://localhost/api/inventory/movements?q=cable&type=ADJUSTMENT&page=2&perPage=10")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([{ id: "m1" }]);
    expect(inventoryService.listMovements).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ q: "cable", type: "ADJUSTMENT", page: 2, perPage: 10 })
    );
  });

  it("rejects an invalid movement type with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await getMovements(request("http://localhost/api/inventory/movements?type=NOT_A_TYPE"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(inventoryService.listMovements).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied businessId — filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(inventoryService.listMovements).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 } as never);

    await getMovements(request("http://localhost/api/inventory/movements?businessId=victim-tenant"));

    const [passedCtx, passedFilter] = vi.mocked(inventoryService.listMovements).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("GET /api/inventory/movements/options", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await getMovementOptions();
    expect(response.status).toBe(401);
  });

  it("returns filter picker options for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(inventoryService.getLedgerFilterOptions).mockResolvedValue({
      products: [{ id: "p1", name: "Cable" }],
      users: [{ id: "u1", name: "Owner" }],
      suppliers: [{ id: "s1", name: "Acme" }],
    } as never);

    const response = await getMovementOptions();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.products).toEqual([{ id: "p1", name: "Cable" }]);
    expect(inventoryService.getLedgerFilterOptions).toHaveBeenCalledWith(ctx);
  });
});
