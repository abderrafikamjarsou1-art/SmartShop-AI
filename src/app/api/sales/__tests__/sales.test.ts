import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn(), requireBusiness: vi.fn() }));
vi.mock("@/services/sale-service", () => ({ saleService: { create: vi.fn(), list: vi.fn() } }));

import { GET, POST } from "../route";
import { requireRole, requireBusiness } from "@/lib/tenant";
import { saleService } from "@/services/sale-service";
import { UnauthorizedError, ConflictError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1", email: "cashier@shop.ma" },
  business: { id: "biz-1", name: "Shop", currency: "MAD", taxRate: 0 },
  role: "CASHIER",
  businessId: "biz-1",
} as never;

function jsonRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/sales", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const validSale = {
  clientRef: "11111111-1111-4111-8111-111111111111",
  items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 2, discountAmount: 0 }],
  payments: [{ method: "CASH", amount: 100 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sales", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest(validSale));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("creates a completed sale and returns 201 with the full receipt shape", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(saleService.create).mockResolvedValue({
      id: "sale-1",
      saleNumber: 42,
      total: "200.00",
      items: [],
      payments: [],
      invoice: { invoiceNumber: 42 },
    } as never);

    const response = await POST(jsonRequest(validSale));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.saleNumber).toBe(42);
    expect(requireRole).toHaveBeenCalledWith("sales:create");
    expect(saleService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ clientRef: validSale.clientRef }));
  });

  it("rejects an empty cart with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(jsonRequest({ ...validSale, items: [] }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("maps an insufficient-stock conflict from the service into a structured 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(saleService.create).mockRejectedValue(new ConflictError('Not enough stock for "Cable" (1 available).'));

    const response = await POST(jsonRequest(validSale));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/Not enough stock/);
  });

  it("is idempotent by clientRef — the route just relays whatever the service returns for a retry", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    const existingSale = { id: "sale-1", saleNumber: 42 };
    vi.mocked(saleService.create).mockResolvedValue(existingSale as never);

    const first = await POST(jsonRequest(validSale));
    const second = await POST(jsonRequest(validSale));

    expect((await first.json()).data).toEqual(existingSale);
    expect((await second.json()).data).toEqual(existingSale);
    expect(saleService.create).toHaveBeenCalledTimes(2); // idempotency itself is the service's job, already tested there
  });
});

describe("GET /api/sales", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await GET(new NextRequest("http://localhost/api/sales"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(saleService.list).not.toHaveBeenCalled();
  });

  it("returns the paginated list for the resolved tenant, filters parsed from the query string", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(saleService.list).mockResolvedValue({
      items: [{ id: "sale-1", saleNumber: 42 }], total: 1, page: 1, totalPages: 1,
    } as never);

    const response = await GET(new NextRequest("http://localhost/api/sales?status=COMPLETED&page=1&perPage=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(saleService.list).toHaveBeenCalledWith(ctx, expect.objectContaining({ status: "COMPLETED" }));
  });
});
