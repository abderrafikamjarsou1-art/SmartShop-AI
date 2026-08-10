import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/product-service", () => ({
  productService: { getFilterOptions: vi.fn() },
}));

import { GET } from "../options/route";
import { requireRole } from "@/lib/tenant";
import { productService } from "@/services/product-service";
import { UnauthorizedError } from "@/lib/errors";

const ctx = { businessId: "biz-1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/products/options", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns categories and suppliers for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.getFilterOptions).mockResolvedValue({
      categories: [{ id: "c1", name: "Drinks" }],
      suppliers: [{ id: "s1", name: "Acme" }],
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      categories: [{ id: "c1", name: "Drinks" }],
      suppliers: [{ id: "s1", name: "Acme" }],
    });
    expect(productService.getFilterOptions).toHaveBeenCalledWith(ctx);
  });
});
