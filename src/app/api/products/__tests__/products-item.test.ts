import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for /api/products/[id] and /api/products/[id]/stock.
 * Same mocking strategy as products-collection.test.ts — see that file's
 * header comment.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/product-service", () => ({
  productService: { getById: vi.fn(), update: vi.fn(), softDelete: vi.fn(), adjustStock: vi.fn() },
}));

import { GET, PATCH, DELETE } from "../[id]/route";
import { POST as adjustStockRoute } from "../[id]/stock/route";
import { requireRole } from "@/lib/tenant";
import { productService } from "@/services/product-service";
import { NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1", email: "owner@shop.ma" },
  business: { id: "biz-1", name: "Shop", currency: "MAD" },
  role: "OWNER",
  businessId: "biz-1",
} as never;

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/products/[id]", () => {
  it("returns the product for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.getById).mockResolvedValue({ id: PRODUCT_ID, name: "Cable" } as never);

    const response = await GET(jsonRequest(`http://localhost/api/products/${PRODUCT_ID}`, "GET"), withId(PRODUCT_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: PRODUCT_ID, name: "Cable" });
    expect(productService.getById).toHaveBeenCalledWith(ctx, PRODUCT_ID);
  });

  it("cross-tenant access: a product id belonging to another business returns 404, not the data", async () => {
    // productService.getById scopes every lookup by ctx.businessId (findFirst,
    // never findUnique-by-id-alone) — from the route's perspective, another
    // tenant's product simply doesn't exist. This test locks in that the
    // route surfaces that as a plain 404, never a 200 with someone else's data.
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.getById).mockRejectedValue(new NotFoundError("Product"));

    const response = await GET(jsonRequest(`http://localhost/api/products/${PRODUCT_ID}`, "GET"), withId(PRODUCT_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  });
});

describe("PATCH /api/products/[id]", () => {
  const updatePayload = {
    name: "Renamed",
    buyingPrice: 10,
    sellingPrice: 20,
    quantity: 7, // required by updateProductSchema; productService.update() ignores it
    minimumStock: 3,
  };

  it("updates the product, using the URL id — never a client-supplied one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.update).mockResolvedValue({ id: PRODUCT_ID, ...updatePayload } as never);

    // Body tries to retarget the write at a different product id.
    const response = await PATCH(
      jsonRequest(`http://localhost/api/products/${PRODUCT_ID}`, "PATCH", { ...updatePayload, id: "someone-elses-id" }),
      withId(PRODUCT_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(productService.update).toHaveBeenCalledWith(ctx, expect.objectContaining({ id: PRODUCT_ID }));
  });
});

describe("DELETE /api/products/[id]", () => {
  it("soft-deletes only — calls productService.softDelete, never a permanent delete", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.softDelete).mockResolvedValue({ count: 1 } as never);

    const response = await DELETE(jsonRequest(`http://localhost/api/products/${PRODUCT_ID}`, "DELETE"), withId(PRODUCT_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ count: 1 });
    expect(productService.softDelete).toHaveBeenCalledWith(ctx, [PRODUCT_ID]);
  });
});

describe("POST /api/products/[id]/stock", () => {
  it("adjusts stock with the required reason", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(productService.adjustStock).mockResolvedValue({ id: PRODUCT_ID, quantity: 42 } as never);

    const response = await adjustStockRoute(
      jsonRequest(`http://localhost/api/products/${PRODUCT_ID}/stock`, "POST", { newQuantity: 42, reason: "Stock count" }),
      withId(PRODUCT_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: PRODUCT_ID, quantity: 42 });
    expect(productService.adjustStock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ id: PRODUCT_ID, newQuantity: 42, reason: "Stock count" })
    );
    // Regression: stock adjustment is an inventory operation, not a catalog
    // edit — must match the web app's adjustProductStock action, which
    // requires "inventory:manage", not "products:manage".
    expect(requireRole).toHaveBeenCalledWith("inventory:manage");
  });

  it("rejects a missing reason with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await adjustStockRoute(
      jsonRequest(`http://localhost/api/products/${PRODUCT_ID}/stock`, "POST", { newQuantity: 42, reason: "" }),
      withId(PRODUCT_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fieldErrors).toHaveProperty("reason");
    expect(productService.adjustStock).not.toHaveBeenCalled();
  });
});
