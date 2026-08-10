import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for the two report types added to /api/reports/export this pass:
 * "low-stock" and "inventory-valuation". Both reuse existing services
 * (productService.list, inventoryService.getExportRows) — these tests
 * verify the route composes them correctly and never re-implements the
 * underlying query. Format=csv is used throughout since it's the
 * simplest to assert on directly (XLSX/PDF are binary).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/report-service", () => ({
  reportService: { resolve: vi.fn() },
}));
vi.mock("@/services/expense-service", () => ({ expenseService: { list: vi.fn() } }));
vi.mock("@/services/product-service", () => ({ productService: { list: vi.fn() } }));
vi.mock("@/services/inventory-service", () => ({ inventoryService: { getExportRows: vi.fn() } }));

import { GET } from "../export/route";
import { requireRole } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { productService } from "@/services/product-service";
import { inventoryService } from "@/services/inventory-service";
import { UnauthorizedError } from "@/lib/errors";

const ctx = { businessId: "biz-1", business: { name: "Shop" } } as never;
const period = { from: new Date("2026-01-01"), to: new Date("2026-02-01"), prevFrom: new Date(), prevTo: new Date(), bucket: "month", label: "January" };

function request(qs: string) {
  return new NextRequest(`http://localhost/api/reports/export?${qs}`, {
    headers: { authorization: "Bearer test-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reportService.resolve).mockReturnValue(period as never);
});

describe("GET /api/reports/export — low-stock", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await GET(request("report=low-stock&format=csv"));
    expect(response.status).toBe(401);
    expect(productService.list).not.toHaveBeenCalled();
  });

  it("exports the tenant's low-stock products via productService.list, no new query logic", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.list).mockResolvedValue({
      items: [
        { name: "Cable", sku: "C1", category: { name: "Electronics" }, quantity: 2, minimumStock: 5 },
        { name: "Mouse", sku: null, category: null, quantity: 0, minimumStock: 3 },
      ],
      total: 2, page: 1, totalPages: 1,
    } as never);

    const response = await GET(request("report=low-stock&format=csv"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(csv).toContain("Cable");
    expect(csv).toContain("Mouse");
    expect(productService.list).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ stock: "low", deleted: false })
    );
  });
});

describe("GET /api/reports/export — inventory-valuation", () => {
  it("exports via inventoryService.getExportRows('stock'), unchanged", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(inventoryService.getExportRows).mockResolvedValue([
      { name: "Cable", sku: "C1", barcode: "", category: "Electronics", supplier: "", quantity: 10, minimumStock: 5, buyingPrice: 5, sellingPrice: 9, stockValue: 50, status: "ACTIVE" },
    ] as never);

    const response = await GET(request("report=inventory-valuation&format=csv"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain("Cable");
    expect(csv).toContain("50");
    expect(inventoryService.getExportRows).toHaveBeenCalledWith(ctx, "stock");
  });
});
