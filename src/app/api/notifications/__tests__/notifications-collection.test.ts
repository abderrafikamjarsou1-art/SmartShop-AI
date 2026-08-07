import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET /api/notifications, GET /api/notifications/
 * unread-count, and POST /api/notifications/mark-all-read. Mocks
 * @/lib/tenant and @/services/notification-service — the service's own
 * logic is covered by src/services/__tests__/notification-service.test.ts.
 * Verifies auth enforcement and correct service calls only.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireBusiness: vi.fn() }));
vi.mock("@/services/notification-service", () => ({
  notificationService: { list: vi.fn(), unreadCount: vi.fn(), markAllRead: vi.fn() },
}));

import { GET } from "../route";
import { GET as getUnreadCount } from "../unread-count/route";
import { POST as markAllRead } from "../mark-all-read/route";
import { requireBusiness } from "@/lib/tenant";
import { notificationService } from "@/services/notification-service";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "CASHIER",
  businessId: "biz-1",
} as never;

function jsonRequest(url: string, method: string) {
  return new NextRequest(url, { method, headers: { authorization: "Bearer test-token" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/notifications", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/notifications", "GET"));
    expect(response.status).toBe(401);
    expect(notificationService.list).not.toHaveBeenCalled();
  });

  it("has no dedicated permission — any business member (e.g. EMPLOYEE) can list", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.list).mockResolvedValue({
      items: [{ id: "n1" }], total: 1, page: 1, totalPages: 1, unreadCount: 1,
    } as never);

    const response = await GET(jsonRequest("http://localhost/api/notifications?unreadOnly=true&page=2", "GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.unreadCount).toBe(1);
    expect(notificationService.list).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ unreadOnly: true, page: 2 })
    );
  });

  it("ignores a client-supplied businessId — filter passed to the service never contains one", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.list).mockResolvedValue({
      items: [], total: 0, page: 1, totalPages: 1, unreadCount: 0,
    } as never);

    await GET(jsonRequest("http://localhost/api/notifications?businessId=victim-tenant", "GET"));

    const [passedCtx, passedFilter] = vi.mocked(notificationService.list).mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect(passedFilter).not.toHaveProperty("businessId");
  });
});

describe("GET /api/notifications/unread-count", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());
    const response = await getUnreadCount();
    expect(response.status).toBe(401);
  });

  it("returns the unread count for the resolved tenant", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.unreadCount).mockResolvedValue({ count: 7 } as never);

    const response = await getUnreadCount();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.count).toBe(7);
    expect(notificationService.unreadCount).toHaveBeenCalledWith(ctx);
  });
});

describe("POST /api/notifications/mark-all-read", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await markAllRead(jsonRequest("http://localhost/api/notifications/mark-all-read", "POST"));
    expect(response.status).toBe(401);
    expect(notificationService.markAllRead).not.toHaveBeenCalled();
  });

  it("marks every unread notification as read", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.markAllRead).mockResolvedValue({ count: 3 } as never);

    const response = await markAllRead(jsonRequest("http://localhost/api/notifications/mark-all-read", "POST"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.count).toBe(3);
    expect(notificationService.markAllRead).toHaveBeenCalledWith(ctx);
  });

  it("relays a NotFoundError from the service as a structured 404", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.markAllRead).mockRejectedValue(new NotFoundError("Business"));

    const response = await markAllRead(jsonRequest("http://localhost/api/notifications/mark-all-read", "POST"));
    expect(response.status).toBe(404);
  });
});
