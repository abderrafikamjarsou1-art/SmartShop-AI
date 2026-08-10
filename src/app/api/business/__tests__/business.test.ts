import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/PATCH /api/business — the Settings screen's
 * business-profile editing (mobile has no other way to change business
 * name/currency/timezone/taxRate). Mocks @/lib/tenant and
 * @/services/business-service — businessService.update's own transaction
 * logic is covered by business-service.test.ts.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/business-service", () => ({
  businessService: { update: vi.fn() },
}));

import { GET, PATCH } from "../route";
import { requireRole } from "@/lib/tenant";
import { businessService } from "@/services/business-service";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1", name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20 },
  role: "OWNER",
  businessId: "biz-1",
} as never;

const validInput = { name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10 };

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/business", {
    method: "PATCH",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/business", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("rejects a role without settings:manage", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());
    const response = await GET();
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("settings:manage");
  });

  it("returns the current tenant's business profile", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      id: "biz-1", name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20,
    });
  });
});

describe("PATCH /api/business", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    const response = await PATCH(patchRequest(validInput));
    expect(response.status).toBe(401);
    expect(businessService.update).not.toHaveBeenCalled();
  });

  it("updates the resolved tenant's business and never trusts a businessId from the body", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(businessService.update).mockResolvedValue({
      id: "biz-1", name: "New Name", currency: "USD", timezone: "UTC", taxRate: 10,
    } as never);

    const response = await PATCH(patchRequest({ ...validInput, id: "someone-elses-business" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("New Name");
    expect(businessService.update).toHaveBeenCalledWith(ctx, expect.objectContaining({ name: "New Name" }));
  });

  it("rejects an invalid currency code with a structured validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    const response = await PATCH(patchRequest({ ...validInput, currency: "US" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(businessService.update).not.toHaveBeenCalled();
  });
});
