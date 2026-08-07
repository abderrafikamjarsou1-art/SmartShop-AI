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
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual(
      expect.objectContaining({ id: "user-1", email: "owner@b.com", role: "OWNER", businessId: "biz-1" })
    );
  });

  it("returns null role/businessId for a user with no business yet (onboarding), not an error", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      userId: "user-2", email: "new@b.com", fullName: null, avatarUrl: null,
      isSuperAdmin: false, role: null, businessId: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.role).toBeNull();
    expect(body.user.businessId).toBeNull();
  });
});
