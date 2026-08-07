import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/purchase-service", () => ({
  purchaseService: {
    getById: vi.fn(),
    updateDraft: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    receive: vi.fn(),
    processReturn: vi.fn(),
  },
}));

import { GET, PATCH } from "../[id]/route";
import { POST as sendRoute } from "../[id]/send/route";
import { POST as cancelRoute } from "../[id]/cancel/route";
import { POST as receiveRoute } from "../[id]/receive/route";
import { POST as returnRoute } from "../[id]/return/route";
import { requireRole } from "@/lib/tenant";
import { purchaseService } from "@/services/purchase-service";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

const PURCHASE_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_REF = "55555555-5555-4555-8555-555555555555";

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

describe("GET /api/purchases/[id]", () => {
  it("returns the purchase order for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.getById).mockResolvedValue({ id: PURCHASE_ID, status: "DRAFT" } as never);

    const response = await GET(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}`, "GET"), withId(PURCHASE_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: PURCHASE_ID, status: "DRAFT" });
    expect(purchaseService.getById).toHaveBeenCalledWith(ctx, PURCHASE_ID);
  });

  it("cross-tenant access: another tenant's PO id returns 404, not the data", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.getById).mockRejectedValue(new NotFoundError("Purchase order"));

    const response = await GET(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}`, "GET"), withId(PURCHASE_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.data).toBeUndefined();
  });
});

describe("PATCH /api/purchases/[id]", () => {
  it("updates a draft, using the URL id — never a client-supplied one", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.updateDraft).mockResolvedValue({ id: PURCHASE_ID, status: "DRAFT" } as never);

    const payload = {
      supplierId: "22222222-2222-4222-8222-222222222222",
      items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 5, unitCost: 4 }],
      id: "someone-elses-id",
    };

    const response = await PATCH(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}`, "PATCH", payload), withId(PURCHASE_ID));
    expect(response.status).toBe(200);
    expect(purchaseService.updateDraft).toHaveBeenCalledWith(ctx, expect.objectContaining({ id: PURCHASE_ID }));
  });

  it("relays the service's not-a-draft rejection as a structured error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.updateDraft).mockRejectedValue(
      new ValidationError("Only draft purchase orders can be edited.")
    );

    const payload = {
      supplierId: "22222222-2222-4222-8222-222222222222",
      items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 5, unitCost: 4 }],
    };

    const response = await PATCH(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}`, "PATCH", payload), withId(PURCHASE_ID));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).toMatch(/Only draft/);
  });
});

describe("POST /api/purchases/[id]/send", () => {
  it("sends the draft, resolving DRAFT -> ORDERED", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.send).mockResolvedValue({ id: PURCHASE_ID, status: "ORDERED" } as never);

    const response = await sendRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/send`, "POST"), withId(PURCHASE_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ORDERED");
    expect(purchaseService.send).toHaveBeenCalledWith(ctx, PURCHASE_ID);
  });
});

describe("POST /api/purchases/[id]/cancel", () => {
  it("cancels an unreceived order", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.cancel).mockResolvedValue({ id: PURCHASE_ID, status: "CANCELLED" } as never);

    const response = await cancelRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/cancel`, "POST"), withId(PURCHASE_ID));
    expect(response.status).toBe(200);
    expect(purchaseService.cancel).toHaveBeenCalledWith(ctx, PURCHASE_ID);
  });

  it("relays the service's has-received-items rejection", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.cancel).mockRejectedValue(
      new ValidationError("This order has received items — return them to the supplier instead.")
    );

    const response = await cancelRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/cancel`, "POST"), withId(PURCHASE_ID));
    expect(response.status).toBe(422);
  });
});

describe("POST /api/purchases/[id]/receive", () => {
  const receivePayload = {
    clientRef: CLIENT_REF,
    items: [{ purchaseItemId: ITEM_ID, quantity: 5 }],
  };

  it("receives items, using the URL id — never a client-supplied purchaseId", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.receive).mockResolvedValue({ id: PURCHASE_ID, status: "PARTIALLY_RECEIVED" } as never);

    const response = await receiveRoute(
      jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/receive`, "POST", { ...receivePayload, purchaseId: "someone-elses-id" }),
      withId(PURCHASE_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("PARTIALLY_RECEIVED");
    expect(purchaseService.receive).toHaveBeenCalledWith(ctx, expect.objectContaining({ purchaseId: PURCHASE_ID, clientRef: CLIENT_REF }));
  });

  it("is idempotent by clientRef — the route just relays whatever the service returns for a retry", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    const existingState = { id: PURCHASE_ID, status: "RECEIVED" };
    vi.mocked(purchaseService.receive).mockResolvedValue(existingState as never);

    const first = await receiveRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/receive`, "POST", receivePayload), withId(PURCHASE_ID));
    const second = await receiveRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/receive`, "POST", receivePayload), withId(PURCHASE_ID));

    expect((await first.json()).data).toEqual(existingState);
    expect((await second.json()).data).toEqual(existingState);
  });

  it("rejects a missing clientRef with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await receiveRoute(
      jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/receive`, "POST", { items: receivePayload.items }),
      withId(PURCHASE_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(purchaseService.receive).not.toHaveBeenCalled();
  });
});

describe("POST /api/purchases/[id]/return", () => {
  it("returns received units to the supplier", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.processReturn).mockResolvedValue({ id: PURCHASE_ID } as never);

    const payload = { items: [{ purchaseItemId: ITEM_ID, quantity: 2 }], reason: "Damaged in transit" };
    const response = await returnRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/return`, "POST", payload), withId(PURCHASE_ID));

    expect(response.status).toBe(200);
    expect(purchaseService.processReturn).toHaveBeenCalledWith(ctx, expect.objectContaining({ purchaseId: PURCHASE_ID, reason: "Damaged in transit" }));
  });

  it("maps an insufficient-stock conflict from the service into a structured 409", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(purchaseService.processReturn).mockRejectedValue(
      new ConflictError('Not enough stock of "Cable" on hand to return (some may be sold).')
    );

    const payload = { items: [{ purchaseItemId: ITEM_ID, quantity: 2 }], reason: "Damaged" };
    const response = await returnRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/return`, "POST", payload), withId(PURCHASE_ID));

    expect(response.status).toBe(409);
  });

  it("rejects a missing reason with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const payload = { items: [{ purchaseItemId: ITEM_ID, quantity: 2 }], reason: "" };
    const response = await returnRoute(jsonRequest(`http://localhost/api/purchases/${PURCHASE_ID}/return`, "POST", payload), withId(PURCHASE_ID));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fieldErrors).toHaveProperty("reason");
    expect(purchaseService.processReturn).not.toHaveBeenCalled();
  });
});
