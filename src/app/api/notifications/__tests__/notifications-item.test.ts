import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireBusiness: vi.fn() }));
vi.mock("@/services/notification-service", () => ({
  notificationService: { markRead: vi.fn(), delete: vi.fn() },
}));

import { PATCH, DELETE } from "../[id]/route";
import { requireBusiness } from "@/lib/tenant";
import { notificationService } from "@/services/notification-service";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "CASHIER",
  businessId: "biz-1",
} as never;

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";

function jsonRequest(url: string, method: string) {
  return new NextRequest(url, { method, headers: { authorization: "Bearer test-token" } });
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/notifications/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await PATCH(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "PATCH"),
      withId(NOTIFICATION_ID)
    );
    expect(response.status).toBe(401);
    expect(notificationService.markRead).not.toHaveBeenCalled();
  });

  it("marks the notification as read", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.markRead).mockResolvedValue({ id: NOTIFICATION_ID, readAt: new Date() } as never);

    const response = await PATCH(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "PATCH"),
      withId(NOTIFICATION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(NOTIFICATION_ID);
    expect(notificationService.markRead).toHaveBeenCalledWith(ctx, NOTIFICATION_ID);
  });

  it("cross-tenant access: another tenant's notification id returns 404", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.markRead).mockRejectedValue(new NotFoundError("Notification"));

    const response = await PATCH(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "PATCH"),
      withId(NOTIFICATION_ID)
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/notifications/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireBusiness).mockRejectedValue(new UnauthorizedError());

    const response = await DELETE(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "DELETE"),
      withId(NOTIFICATION_ID)
    );
    expect(response.status).toBe(401);
    expect(notificationService.delete).not.toHaveBeenCalled();
  });

  it("deletes the notification", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.delete).mockResolvedValue({ id: NOTIFICATION_ID } as never);

    const response = await DELETE(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "DELETE"),
      withId(NOTIFICATION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: NOTIFICATION_ID });
    expect(notificationService.delete).toHaveBeenCalledWith(ctx, NOTIFICATION_ID);
  });

  it("cross-tenant access: another tenant's notification id returns 404", async () => {
    vi.mocked(requireBusiness).mockResolvedValue(ctx);
    vi.mocked(notificationService.delete).mockRejectedValue(new NotFoundError("Notification"));

    const response = await DELETE(
      jsonRequest(`http://localhost/api/notifications/${NOTIFICATION_ID}`, "DELETE"),
      withId(NOTIFICATION_ID)
    );
    expect(response.status).toBe(404);
  });
});
