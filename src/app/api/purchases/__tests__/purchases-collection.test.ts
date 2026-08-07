import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/purchases and GET /api/purchases/options.
 * Mocks @/lib/tenant and @/services/purchase-service — purchaseService's
 * own logic is already covered by its own service tests. Verifies auth
 * enforcement, real Zod validation, correct service calls, and response
 * shaping.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/purchase-service", () => ({
  purchaseService: { list: vi.fn(), create: vi.fn(), getFormOptions: vi.fn() },
}));

import { GET, POST } from "../route";
import { GET as getOptions } from "../options/route";
import { requireRole } from "@/lib/tenant";
import { purchaseService } from "@/services/purchase-service";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/purchases", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/purchases", "GET"));
    expect(response.status).toBe(401);
    expect(purchaseService.list).not.toHaveBeenCalled();
  });

  it("rejects a role without purchases:manage (e.g. cashier)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await GET(jsonRequest("http://localhost/api/purchases", "GET"));
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("purchases:manage");
  });

  it("lists purchases with search, status filter and pagination applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.list).mockResolvedValue({
      items: [{ id: "po1", purchaseNumber: 1 }],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never);

    const response = await GET(
      jsonRequest("http://localhost/api/purchases?q=1&status=ORDERED&page=2&perPage=10", "GET")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([{ id: "po1", purchaseNumber: 1 }]);
    expect(purchaseService.list).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ q: "1", status: "ORDERED", page: 2, perPage: 10 })
    );
  });

  it("ignores a client-supplied businessId — filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.list).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 } as never);

    await GET(jsonRequest("http://localhost/api/purchases?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(purchaseService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("POST /api/purchases", () => {
  const validInput = {
    supplierId: SUPPLIER_ID,
    items: [{ productId: PRODUCT_ID, quantity: 10, unitCost: 5 }],
  };

  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/purchases", "POST", validInput));
    expect(response.status).toBe(401);
    expect(purchaseService.create).not.toHaveBeenCalled();
  });

  it("creates a draft purchase order and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.create).mockResolvedValue({ id: "po1", status: "DRAFT" } as never);

    const response = await POST(jsonRequest("http://localhost/api/purchases", "POST", validInput));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: "po1", status: "DRAFT" });
    expect(purchaseService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ supplierId: SUPPLIER_ID }));
  });

  it("returns a structured validation error for an empty item list — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(
      jsonRequest("http://localhost/api/purchases", "POST", { supplierId: SUPPLIER_ID, items: [] })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(purchaseService.create).not.toHaveBeenCalled();
  });

  it("maps an unknown supplier from the service into a structured 404", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.create).mockRejectedValue(new NotFoundError("Supplier"));

    const response = await POST(jsonRequest("http://localhost/api/purchases", "POST", validInput));
    expect(response.status).toBe(404);
  });
});

describe("GET /api/purchases/options", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await getOptions();
    expect(response.status).toBe(401);
  });

  it("returns suppliers and products for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.getFormOptions).mockResolvedValue({
      suppliers: [{ id: SUPPLIER_ID, name: "Acme" }],
      products: [{ id: PRODUCT_ID, name: "Cable", sku: "C1", buyingPrice: 5 }],
    } as never);

    const response = await getOptions();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suppliers).toEqual([{ id: SUPPLIER_ID, name: "Acme" }]);
    expect(purchaseService.getFormOptions).toHaveBeenCalledWith(ctx);
  });
});
