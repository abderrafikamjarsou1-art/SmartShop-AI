import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/products.
 * Mocks @/lib/tenant (auth/tenant resolution) and @/services/product-service
 * (business logic — already covered by src/services/__tests__/product-service.test.ts).
 * What THIS file verifies is the route's own job: auth enforcement, real
 * Zod validation, correct service calls, and response shaping — never
 * re-testing Prisma logic.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/product-service", () => ({
  productService: { list: vi.fn(), create: vi.fn() },
}));

import { GET, POST } from "../route";
import { requireRole } from "@/lib/tenant";
import { productService } from "@/services/product-service";
import { UnauthorizedError, ConflictError, ForbiddenError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1", email: "owner@shop.ma" },
  business: { id: "biz-1", name: "Shop", currency: "MAD" },
  role: "OWNER",
  businessId: "biz-1",
} as never;

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

describe("GET /api/products", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/products", "GET"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.requestId).toBeTruthy();
    expect(vi.mocked(productService.list)).not.toHaveBeenCalled();
  });

  it("lists products for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.list).mockResolvedValue({
      items: [{ id: "p1", name: "Cable" }],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never);

    const response = await GET(jsonRequest("http://localhost/api/products?q=cable&page=1&perPage=20", "GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { items: [{ id: "p1", name: "Cable" }], total: 1, page: 1, totalPages: 1 },
      requestId: body.requestId,
    });
    expect(requireRole).toHaveBeenCalledWith("products:view");
    expect(productService.list).toHaveBeenCalledWith(ctx, expect.objectContaining({ q: "cable", page: 1, perPage: 20 }));
  });

  it("ignores a client-supplied businessId — the filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.list).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 } as never);

    // A hostile client tries to smuggle another tenant's id via the query string.
    await GET(jsonRequest("http://localhost/api/products?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(productService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx); // always the server-resolved tenant, never client input
    expect(passedFilter).not.toHaveProperty("businessId"); // productFilterSchema has no such field — Zod strips it
  });
});

describe("POST /api/products", () => {
  const validInput = {
    name: "New Product",
    buyingPrice: 10,
    sellingPrice: 15,
    quantity: 5,
    minimumStock: 2,
  };

  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/products", "POST", validInput));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(productService.create).not.toHaveBeenCalled();
  });

  it("rejects a role without products:manage", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await POST(jsonRequest("http://localhost/api/products", "POST", validInput));
    expect(response.status).toBe(403);
  });

  it("creates a product and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.create).mockResolvedValue({ id: "p1", ...validInput } as never);

    const response = await POST(jsonRequest("http://localhost/api/products", "POST", validInput));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: "p1", ...validInput });
    expect(requireRole).toHaveBeenCalledWith("products:manage");
    expect(productService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ name: "New Product" }));
  });

  it("returns a structured validation error for an empty name — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(
      jsonRequest("http://localhost/api/products", "POST", { ...validInput, name: "" })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors).toHaveProperty("name");
    expect(productService.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate-SKU conflict from the service into a structured 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.create).mockRejectedValue(new ConflictError("A product with this SKU already exists."));

    const response = await POST(
      jsonRequest("http://localhost/api/products", "POST", { ...validInput, sku: "DUP-1" })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/SKU already exists/);
  });
});
