import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/customer-service", () => ({
  customerService: { getProfile: vi.fn(), update: vi.fn(), softDelete: vi.fn(), recordPayment: vi.fn() },
}));

import { GET, PATCH, DELETE } from "../[id]/route";
import { POST as recordPaymentRoute } from "../[id]/payment/route";
import { requireRole } from "@/lib/tenant";
import { customerService } from "@/services/customer-service";
import { NotFoundError, ValidationError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "OWNER",
  businessId: "biz-1",
} as never;

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";

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

describe("GET /api/customers/[id]", () => {
  it("returns the full profile (customer + KPIs + recent activity)", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.getProfile).mockResolvedValue({
      customer: { id: CUSTOMER_ID, name: "Amine" },
      kpis: { ltv: 500, orders: 3, aov: 166.66, lastPurchase: null, outstandingBalance: 0, storeCredit: 0 },
      favorites: [],
      recentSales: [],
      payments: [],
    } as never);

    const response = await GET(jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, "GET"), withId(CUSTOMER_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.customer.name).toBe("Amine");
    expect(customerService.getProfile).toHaveBeenCalledWith(ctx, CUSTOMER_ID);
  });

  it("cross-tenant access: another tenant's customer id returns 404, not the data", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.getProfile).mockRejectedValue(new NotFoundError("Customer"));

    const response = await GET(jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, "GET"), withId(CUSTOMER_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.data).toBeUndefined();
  });
});

describe("PATCH /api/customers/[id]", () => {
  it("updates the customer, using the URL id — never a client-supplied one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.update).mockResolvedValue({ id: CUSTOMER_ID, name: "Amine Updated" } as never);

    const response = await PATCH(
      jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, "PATCH", { name: "Amine Updated", id: "someone-elses-id" }),
      withId(CUSTOMER_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(customerService.update).toHaveBeenCalledWith(ctx, expect.objectContaining({ id: CUSTOMER_ID, name: "Amine Updated" }));
  });
});

describe("DELETE /api/customers/[id]", () => {
  it("soft-deletes when there is no outstanding balance", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.softDelete).mockResolvedValue({ id: CUSTOMER_ID } as never);

    const response = await DELETE(jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, "DELETE"), withId(CUSTOMER_ID));
    expect(response.status).toBe(200);
    expect(customerService.softDelete).toHaveBeenCalledWith(ctx, CUSTOMER_ID);
  });

  it("relays the service's balance-guard rejection as a structured error, not a crash", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.softDelete).mockRejectedValue(
      new ValidationError("This customer still owes money — settle the balance before deleting.")
    );

    const response = await DELETE(jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, "DELETE"), withId(CUSTOMER_ID));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).toMatch(/still owes money/);
  });
});

describe("POST /api/customers/[id]/payment", () => {
  it("records a payment against the URL customer id — never a client-supplied one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.recordPayment).mockResolvedValue({
      payment: { id: "p1", amount: 100 },
      allocations: [{ saleId: "s1", saleNumber: 1, amount: 100 }],
    } as never);

    const response = await recordPaymentRoute(
      jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}/payment`, "POST", {
        method: "CASH",
        amount: 100,
        customerId: "someone-elses-id",
      }),
      withId(CUSTOMER_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.allocations).toHaveLength(1);
    expect(customerService.recordPayment).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ customerId: CUSTOMER_ID, amount: 100, method: "CASH" })
    );
  });

  it("relays a no-outstanding-balance rejection as a structured error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(customerService.recordPayment).mockRejectedValue(
      new ValidationError("This customer has no outstanding balance.")
    );

    const response = await recordPaymentRoute(
      jsonRequest(`http://localhost/api/customers/${CUSTOMER_ID}/payment`, "POST", { method: "CASH", amount: 50 }),
      withId(CUSTOMER_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).toMatch(/no outstanding balance/);
  });
});
