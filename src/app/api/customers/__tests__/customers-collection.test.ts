import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/customers. Mocks @/lib/tenant and
 * @/services/customer-service — customerService's own logic is already
 * covered by its own service tests. Verifies auth enforcement, real Zod
 * validation, correct service calls, and response shaping.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/customer-service", () => ({
  customerService: { list: vi.fn(), create: vi.fn() },
}));

import { GET, POST } from "../route";
import { requireRole } from "@/lib/tenant";
import { customerService } from "@/services/customer-service";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "CASHIER",
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

describe("GET /api/customers", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/customers", "GET"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(customerService.list).not.toHaveBeenCalled();
  });

  it("lists customers with search, balance filter and pagination applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.list).mockResolvedValue({
      items: [{ id: "c1", name: "Amine" }],
      total: 1,
      page: 1,
      totalPages: 1,
    } as never);

    const response = await GET(
      jsonRequest("http://localhost/api/customers?q=amine&balance=owing&page=2&perPage=10", "GET")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([{ id: "c1", name: "Amine" }]);
    expect(requireRole).toHaveBeenCalledWith("customers:manage");
    expect(customerService.list).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ q: "amine", balance: "owing", page: 2, perPage: 10 })
    );
  });

  it("ignores a client-supplied businessId — the filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.list).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 } as never);

    await GET(jsonRequest("http://localhost/api/customers?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(customerService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("POST /api/customers", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "Amine" }));
    expect(response.status).toBe(401);
    expect(customerService.create).not.toHaveBeenCalled();
  });

  it("rejects a role without customers:manage", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "Amine" }));
    expect(response.status).toBe(403);
  });

  it("creates a customer and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.create).mockResolvedValue({ id: "c1", name: "Amine" } as never);

    const response = await POST(
      jsonRequest("http://localhost/api/customers", "POST", { name: "Amine", phone: "0600000000" })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: "c1", name: "Amine" });
    expect(customerService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ name: "Amine" }));
  });

  it("returns a structured validation error for an empty name — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors).toHaveProperty("name");
    expect(customerService.create).not.toHaveBeenCalled();
  });
});
