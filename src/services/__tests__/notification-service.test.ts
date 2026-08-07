import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { notificationService } from "@/services/notification-service";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocked = prisma as any;

const ctx = {
  businessId: "biz-1", role: "OWNER",
  user: { id: "user-1" },
  business: { id: "biz-1" },
} as unknown as TenantContext;

beforeEach(() => vi.clearAllMocks());

describe("notificationService.list", () => {
  it("scopes to businessId and (userId=null OR userId=current user), returns unreadCount", async () => {
    mocked.$transaction.mockResolvedValueOnce([[{ id: "n1" }], 1, 2]);

    const result = await notificationService.list(ctx, { page: 1, perPage: 20, unreadOnly: false });

    expect(result).toEqual({ items: [{ id: "n1" }], total: 1, page: 1, totalPages: 1, unreadCount: 2 });
    const findManyArgs = mocked.notification.findMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({
      businessId: "biz-1",
      OR: [{ userId: null }, { userId: "user-1" }],
    });
  });

  it("unreadOnly narrows the filter to readAt: null", async () => {
    mocked.$transaction.mockResolvedValueOnce([[], 0, 0]);

    await notificationService.list(ctx, { page: 1, perPage: 20, unreadOnly: true });

    const findManyArgs = mocked.notification.findMany.mock.calls[0][0];
    expect(findManyArgs.where.readAt).toBeNull();
  });
});

describe("notificationService.unreadCount", () => {
  it("counts unread notifications visible to the current user", async () => {
    mocked.notification.count.mockResolvedValue(4);
    const result = await notificationService.unreadCount(ctx);
    expect(result).toEqual({ count: 4 });
    expect(mocked.notification.count).toHaveBeenCalledWith({
      where: { businessId: "biz-1", OR: [{ userId: null }, { userId: "user-1" }], readAt: null },
    });
  });
});

describe("notificationService.markRead", () => {
  it("marks an unread notification as read", async () => {
    mocked.notification.findFirst.mockResolvedValue({ id: "n1", readAt: null });
    mocked.notification.update.mockResolvedValue({ id: "n1", readAt: new Date() });

    const result = await notificationService.markRead(ctx, "n1");

    expect(mocked.notification.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { readAt: expect.any(Date) } });
    expect(result.readAt).toBeDefined();
  });

  it("is idempotent — an already-read notification is returned without a write", async () => {
    const already = { id: "n1", readAt: new Date("2026-01-01") };
    mocked.notification.findFirst.mockResolvedValue(already);

    const result = await notificationService.markRead(ctx, "n1");

    expect(result).toBe(already);
    expect(mocked.notification.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for another tenant's notification", async () => {
    mocked.notification.findFirst.mockResolvedValue(null);
    await expect(notificationService.markRead(ctx, "n1")).rejects.toThrow(NotFoundError);
  });
});

describe("notificationService.markAllRead", () => {
  it("updates every visible unread notification and returns the count", async () => {
    mocked.notification.updateMany.mockResolvedValue({ count: 5 });

    const result = await notificationService.markAllRead(ctx);

    expect(result).toEqual({ count: 5 });
    expect(mocked.notification.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", OR: [{ userId: null }, { userId: "user-1" }], readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("notificationService.delete", () => {
  it("deletes a visible notification", async () => {
    mocked.notification.findFirst.mockResolvedValue({ id: "n1" });
    mocked.notification.delete.mockResolvedValue({ id: "n1" });

    const result = await notificationService.delete(ctx, "n1");

    expect(result).toEqual({ id: "n1" });
    expect(mocked.notification.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("throws NotFoundError for another tenant's notification", async () => {
    mocked.notification.findFirst.mockResolvedValue(null);
    await expect(notificationService.delete(ctx, "n1")).rejects.toThrow(NotFoundError);
  });
});

describe("notificationService.create", () => {
  it("defaults userId (broadcast) and link to null when omitted", async () => {
    mocked.notification.create.mockResolvedValue({ id: "n1" });

    await notificationService.create({ businessId: "biz-1", type: "LOW_STOCK", title: "t", message: "m" });

    expect(mocked.notification.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", userId: null, type: "LOW_STOCK", title: "t", message: "m", link: null },
    });
  });

  it("targets a specific user and link when provided", async () => {
    mocked.notification.create.mockResolvedValue({ id: "n1" });

    await notificationService.create({
      businessId: "biz-1", userId: "user-2", type: "SALE", title: "t", message: "m", link: "/sales/1",
    });

    expect(mocked.notification.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", userId: "user-2", type: "SALE", title: "t", message: "m", link: "/sales/1" },
    });
  });
});
