import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/suppliers. Mocks @/lib/tenant and
 * @/services/supplier-service — supplierService's own logic is already
 * covered elsewhere. Verifies auth enforcement, real Zod validation,
 * correct service calls, and response shaping.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/supplier-service", () => ({
  supplierService: { list: vi.fn(), create: vi.fn() },
}));

import { GET, POST } from "../route";
import { requireRole } from "@/lib/tenant";
import { supplierService } from "@/services/supplier-service";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
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

describe("GET /api/suppliers", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/suppliers", "GET"));
    expect(response.status).toBe(401);
    expect(supplierService.list).not.toHaveBeenCalled();
  });

  it("lists suppliers with search and pagination applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(supplierService.list).mockResolvedValue({
      items: [{ id: "s1", name: "Acme" }],
      total: 1, page: 1, totalPages: 1,
    } as never);

    const response = await GET(jsonRequest("http://localhost/api/suppliers?q=acme&page=2&perPage=10", "GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([{ id: "s1", name: "Acme" }]);
    expect(requireRole).toHaveBeenCalledWith("suppliers:manage");
    expect(supplierService.list).toHaveBeenCalledWith(ctx, expect.objectContaining({ q: "acme", page: 2, perPage: 10 }));
  });

  it("ignores a client-supplied businessId — the filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(supplierService.list).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 } as never);

    await GET(jsonRequest("http://localhost/api/suppliers?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(supplierService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("POST /api/suppliers", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/suppliers", "POST", { name: "Acme" }));
    expect(response.status).toBe(401);
    expect(supplierService.create).not.toHaveBeenCalled();
  });

  it("rejects a role without suppliers:manage", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await POST(jsonRequest("http://localhost/api/suppliers", "POST", { name: "Acme" }));
    expect(response.status).toBe(403);
  });

  it("creates a supplier and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(supplierService.create).mockResolvedValue({ id: "s1", name: "Acme" } as never);

    const response = await POST(jsonRequest("http://localhost/api/suppliers", "POST", { name: "Acme", phone: "0600000000" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: "s1", name: "Acme" });
    expect(supplierService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ name: "Acme" }));
  });

  it("returns a structured validation error for an empty name — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(jsonRequest("http://localhost/api/suppliers", "POST", { name: "" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors).toHaveProperty("name");
    expect(supplierService.create).not.toHaveBeenCalled();
  });
});
