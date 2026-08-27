import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-api-auth", () => ({ requireApiAuth: vi.fn() }));

import { GET } from "../me/route";
import { requireApiAuth } from "@/lib/require-api-auth";
import { UnauthorizedError } from "@/lib/errors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/me", () => {
  it("rejects an unauthenticated request with 401", async () => {
    vi.mocked(requireApiAuth).mockRejectedValue(new UnauthorizedError());

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the current user for either transport (bearer or cookie)", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      userId: "user-1", email: "owner@b.com", fullName: "Owner", avatarUrl: null,
      isSuperAdmin: false, role: "OWNER", businessId: "biz-1",
      businessName: "Shop", businessCurrency: "MAD", businessTaxRate: 20,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual(
      expect.objectContaining({ id: "user-1", email: "owner@b.com", role: "OWNER", businessId: "biz-1" })
    );
  });

  it("includes the business name/currency — every screen that renders money needs it, regardless of role", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      userId: "user-1", email: "cashier@b.com", fullName: "Cashier", avatarUrl: null,
      isSuperAdmin: false, role: "CASHIER", businessId: "biz-1",
      businessName: "Casa Phone Store", businessCurrency: "MAD", businessTaxRate: 20,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.user.businessName).toBe("Casa Phone Store");
    expect(body.user.businessCurrency).toBe("MAD");
  });

  it("includes the business tax rate — POS needs it to show/charge the same tax-inclusive total the server computes", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      userId: "user-1", email: "cashier@b.com", fullName: "Cashier", avatarUrl: null,
      isSuperAdmin: false, role: "CASHIER", businessId: "biz-1",
      businessName: "Casa Phone Store", businessCurrency: "MAD", businessTaxRate: 20,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.user.businessTaxRate).toBe(20);
  });

  it("returns null role/businessId for a user with no business yet (onboarding), not an error", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      userId: "user-2", email: "new@b.com", fullName: null, avatarUrl: null,
      isSuperAdmin: false, role: null, businessId: null,
      businessName: null, businessCurrency: null, businessTaxRate: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.role).toBeNull();
    expect(body.user.businessId).toBeNull();
  });
});
