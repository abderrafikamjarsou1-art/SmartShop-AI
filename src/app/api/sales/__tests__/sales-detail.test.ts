import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireBusiness: vi.fn() }));
vi.mock("@/services/sale-service", () => ({ saleService: { getById: vi.fn() } }));

import { GET } from "../[id]/route";
import { requireBusiness } from "@/lib/tenant";
import { saleService } from "@/services/sale-service";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1", email: "cashier@shop.ma" },
  business: { id: "biz-1", name: "Shop", currency: "MAD", taxRate: 0 },
  role: "CASHIER",
  businessId: "biz-1",
} as never;

const VALID_ID = "22222222-2222-4222-8222-222222222222";

function req(id: string) {
  return {
    request: new NextRequest(`http://localhost/api/sales/${id}`),
    params: Promise.resolve({ id }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sales/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const { request, params } = req(VALID_ID);
    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(saleService.getById).not.toHaveBeenCalled();
  });

  it("returns the sale for a valid id scoped to the resolved tenant", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(saleService.getById).mockResolvedValue({ id: VALID_ID, saleNumber: 42 } as never);

    const { request, params } = req(VALID_ID);
    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.saleNumber).toBe(42);
    expect(saleService.getById).toHaveBeenCalledWith(ctx, VALID_ID);
  });

  it("404s for another tenant's sale (service enforces ownership)", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(saleService.getById).mockRejectedValue(new NotFoundError("Sale"));

    const { request, params } = req(VALID_ID);
    const response = await GET(request, { params });

    expect(response.status).toBe(404);
  });

  it("rejects a non-uuid id with a structured validation error, never reaching the service", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);

    const { request, params } = req("not-a-uuid");
    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(saleService.getById).not.toHaveBeenCalled();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
