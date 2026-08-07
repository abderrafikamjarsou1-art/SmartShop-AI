import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/expenses and GET /api/expenses/options.
 * Mocks @/lib/tenant and @/services/expense-service — expenseService's own
 * logic is already covered by its own service tests. Verifies auth
 * enforcement, real Zod validation, correct service calls, and response
 * shaping.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/expense-service", () => ({
  expenseService: { list: vi.fn(), create: vi.fn(), getFormOptions: vi.fn() },
}));

import { GET, POST } from "../route";
import { GET as getOptions } from "../options/route";
import { requireRole } from "@/lib/tenant";
import { expenseService } from "@/services/expense-service";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";

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

describe("GET /api/expenses", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/expenses", "GET"));
    expect(response.status).toBe(401);
    expect(expenseService.list).not.toHaveBeenCalled();
  });

  it("rejects a role without expenses:manage (e.g. cashier)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await GET(jsonRequest("http://localhost/api/expenses", "GET"));
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("expenses:manage");
  });

  it("lists expenses with search, category filter and pagination applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.list).mockResolvedValue({
      items: [{ id: "exp1", title: "Office rent" }],
      total: 1, page: 1, totalPages: 1, sumAmount: 500, sumTax: 0,
    } as never);

    const response = await GET(
      jsonRequest("http://localhost/api/expenses?q=rent&category=RENT&page=2&perPage=10", "GET")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([{ id: "exp1", title: "Office rent" }]);
    expect(expenseService.list).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ q: "rent", category: "RENT", page: 2, perPage: 10 })
    );
  });

  it("ignores a client-supplied businessId — filter passed to the service never contains one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.list).mockResolvedValue({
      items: [], total: 0, page: 1, totalPages: 1, sumAmount: 0, sumTax: 0,
    } as never);

    await GET(jsonRequest("http://localhost/api/expenses?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(expenseService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("POST /api/expenses", () => {
  const validInput = {
    title: "Office rent",
    category: "RENT",
    amount: 500,
    date: "2026-08-01",
  };

  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/expenses", "POST", validInput));
    expect(response.status).toBe(401);
    expect(expenseService.create).not.toHaveBeenCalled();
  });

  it("creates an expense and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.create).mockResolvedValue({ id: "exp1", title: "Office rent" } as never);

    const response = await POST(jsonRequest("http://localhost/api/expenses", "POST", validInput));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: "exp1", title: "Office rent" });
    expect(expenseService.create).toHaveBeenCalledWith(ctx, expect.objectContaining({ title: "Office rent" }));
  });

  it("returns a structured validation error for a zero amount — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(
      jsonRequest("http://localhost/api/expenses", "POST", { ...validInput, amount: 0 })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(expenseService.create).not.toHaveBeenCalled();
  });

  it("rejects a recurring expense with no recurrence interval", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await POST(
      jsonRequest("http://localhost/api/expenses", "POST", { ...validInput, isRecurring: true, supplierId: SUPPLIER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fieldErrors).toHaveProperty("recurrenceInterval");
    expect(expenseService.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/expenses/options", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await getOptions();
    expect(response.status).toBe(401);
  });

  it("returns suppliers for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.getFormOptions).mockResolvedValue({
      suppliers: [{ id: SUPPLIER_ID, name: "Acme" }],
    } as never);

    const response = await getOptions();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suppliers).toEqual([{ id: SUPPLIER_ID, name: "Acme" }]);
    expect(expenseService.getFormOptions).toHaveBeenCalledWith(ctx);
  });
});
