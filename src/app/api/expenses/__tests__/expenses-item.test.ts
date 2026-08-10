import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/expense-service", () => ({
  expenseService: {
    getById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
}));

import { GET, PATCH, DELETE } from "../[id]/route";
import { POST as restoreRoute } from "../[id]/restore/route";
import { requireRole } from "@/lib/tenant";
import { expenseService } from "@/services/expense-service";
import { NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";

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

describe("GET /api/expenses/[id]", () => {
  it("returns the expense for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.getById).mockResolvedValue({ id: EXPENSE_ID, title: "Office rent" } as never);

    const response = await GET(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "GET"), withId(EXPENSE_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: EXPENSE_ID, title: "Office rent" });
    expect(expenseService.getById).toHaveBeenCalledWith(ctx, EXPENSE_ID);
  });

  it("cross-tenant access: another tenant's expense id returns 404, not the data", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.getById).mockRejectedValue(new NotFoundError("Expense"));

    const response = await GET(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "GET"), withId(EXPENSE_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.data).toBeUndefined();
  });
});

describe("PATCH /api/expenses/[id]", () => {
  it("updates an expense, using the URL id — never a client-supplied one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.update).mockResolvedValue({ id: EXPENSE_ID, title: "Updated rent" } as never);

    const payload = {
      title: "Updated rent",
      category: "RENT",
      amount: 600,
      date: "2026-08-01",
      id: "someone-elses-id",
    };

    const response = await PATCH(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "PATCH", payload), withId(EXPENSE_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.title).toBe("Updated rent");
    expect(expenseService.update).toHaveBeenCalledWith(ctx, EXPENSE_ID, expect.objectContaining({ title: "Updated rent" }));
  });

  it("returns a structured validation error for a zero amount — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const payload = { title: "Updated rent", category: "RENT", amount: 0, date: "2026-08-01" };

    const response = await PATCH(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "PATCH", payload), withId(EXPENSE_ID));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(expenseService.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/expenses/[id]", () => {
  it("soft deletes an expense", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.softDelete).mockResolvedValue({ id: EXPENSE_ID, deletedAt: new Date() } as never);

    const response = await DELETE(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "DELETE"), withId(EXPENSE_ID));
    expect(response.status).toBe(200);
    expect(expenseService.softDelete).toHaveBeenCalledWith(ctx, EXPENSE_ID);
  });

  it("cross-tenant access: another tenant's expense id returns 404", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.softDelete).mockRejectedValue(new NotFoundError("Expense"));

    const response = await DELETE(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}`, "DELETE"), withId(EXPENSE_ID));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/expenses/[id]/restore", () => {
  it("restores a soft-deleted expense", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.restore).mockResolvedValue({ id: EXPENSE_ID, deletedAt: null } as never);

    const response = await restoreRoute(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}/restore`, "POST"), withId(EXPENSE_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.deletedAt).toBeNull();
    expect(expenseService.restore).toHaveBeenCalledWith(ctx, EXPENSE_ID);
  });

  it("404s when the expense isn't in the trash", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(expenseService.restore).mockRejectedValue(new NotFoundError("Expense"));

    const response = await restoreRoute(jsonRequest(`http://localhost/api/expenses/${EXPENSE_ID}/restore`, "POST"), withId(EXPENSE_ID));
    expect(response.status).toBe(404);
  });
});
