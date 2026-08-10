import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for POST /api/business/onboarding — the fix for the
 * "Business not found" P0: a freshly registered mobile user has no
 * UserBusiness row, so this is the one route that must work with none.
 * Mocks @/lib/auth and @/services/business-service — businessService's
 * own transaction logic is covered by business-service.test.ts. Verifies
 * auth enforcement, identity is never taken from the body, idempotent
 * "already has a business" handling, and validation.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/services/business-service", () => ({
  businessService: { findFirstMembership: vi.fn(), create: vi.fn() },
}));

import { POST } from "../onboarding/route";
import { requireAuth } from "@/lib/auth";
import { businessService } from "@/services/business-service";
import { UnauthorizedError } from "@/lib/errors";

const user = { id: "user-1", email: "owner@example.com" } as never;

const validInput = { name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20 };

function jsonRequest(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/business/onboarding — auth", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/business/onboarding", validInput));

    expect(response.status).toBe(401);
    expect(businessService.create).not.toHaveBeenCalled();
    expect(businessService.findFirstMembership).not.toHaveBeenCalled();
  });
});

describe("POST /api/business/onboarding — first-time creation", () => {
  it("creates the business for the authenticated user and returns 201 with OWNER", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue(null);
    vi.mocked(businessService.create).mockResolvedValue({
      id: "biz-1", name: "Casa Phone Store", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 20,
    } as never);

    const response = await POST(jsonRequest("http://localhost/api/business/onboarding", validInput));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.business).toEqual(
      expect.objectContaining({ id: "biz-1", name: "Casa Phone Store" })
    );
    expect(body.data.role).toBe("OWNER");
    expect(body.data.alreadyExists).toBe(false);
    expect(businessService.create).toHaveBeenCalledWith(user, expect.objectContaining({ name: "Casa Phone Store" }));
  });

  it("never trusts a client-supplied userId/ownerId/businessId in the body — identity comes only from requireAuth()", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue(null);
    vi.mocked(businessService.create).mockResolvedValue({ id: "biz-1", name: "x", currency: "MAD", timezone: "UTC", taxRate: 0 } as never);

    const spoofed = { ...validInput, userId: "someone-elses-id", ownerId: "someone-elses-id", businessId: "existing-biz" };
    await POST(jsonRequest("http://localhost/api/business/onboarding", spoofed));

    // requireAuth() is what resolves identity — the mocked user object,
    // not anything from the body — is what gets passed to the service.
    expect(businessService.create).toHaveBeenCalledWith(user, expect.anything());
    const [passedUser] = vi.mocked(businessService.create).mock.calls[0];
    expect(passedUser).toBe(user);
  });

  it("returns a structured validation error for a missing name — never calls the service", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue(null);

    const response = await POST(jsonRequest("http://localhost/api/business/onboarding", { ...validInput, name: "" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(businessService.create).not.toHaveBeenCalled();
  });

  it("returns a structured validation error for an invalid currency code — never calls the service", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue(null);

    const response = await POST(
      jsonRequest("http://localhost/api/business/onboarding", { ...validInput, currency: "TOOLONG" })
    );

    expect(response.status).toBe(422);
    expect(businessService.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/business/onboarding — already-has-business race condition", () => {
  it("returns the EXISTING business instead of creating a duplicate", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue({
      id: "membership-1",
      userId: "user-1",
      businessId: "biz-existing",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
      business: {
        id: "biz-existing", name: "Already Onboarded Shop", currency: "MAD", timezone: "Africa/Casablanca", taxRate: 10,
      },
    } as never);

    const response = await POST(jsonRequest("http://localhost/api/business/onboarding", validInput));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.business).toEqual(
      expect.objectContaining({ id: "biz-existing", name: "Already Onboarded Shop" })
    );
    expect(body.data.role).toBe("OWNER");
    expect(body.data.alreadyExists).toBe(true);

    // Retry-safe: a second submission (double-tap, network retry) must
    // never create a second business.
    expect(businessService.create).not.toHaveBeenCalled();
  });

  it("checks for an existing membership BEFORE parsing the body — a malformed retry still resolves to the existing business, not a validation error", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(businessService.findFirstMembership).mockResolvedValue({
      id: "membership-1", userId: "user-1", businessId: "biz-existing", role: "MANAGER",
      createdAt: new Date(), updatedAt: new Date(),
      business: { id: "biz-existing", name: "Shop", currency: "MAD", timezone: "UTC", taxRate: 0 },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/business/onboarding", {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: "not valid json",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.alreadyExists).toBe(true);
    expect(body.data.role).toBe("MANAGER");
  });
});
