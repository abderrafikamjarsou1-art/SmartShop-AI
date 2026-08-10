import "server-only";
import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import type { NotificationFilter } from "@/lib/validation/notification";

/**
 * Notification service.
 *
 * VISIBILITY: a notification is either broadcast to the whole business
 * (userId = null — e.g. a future low-stock alert everyone with access
 * should see) or targeted at one member (userId set). list/count/markRead
 * always scope to businessId AND (userId IS NULL OR userId = current user).
 *
 * PRODUCERS: create() is the seam for future callers (low-stock crossing,
 * new sale, payment recorded, subscription changed) — none are wired in
 * yet. Each would touch a different core, already-tested service
 * (sale-service, inventory-service, customer-service, the Stripe webhook)
 * and the firing/dedup rules are product decisions, so wiring them in is
 * deliberately out of scope for this pass. This service is the complete,
 * ready-to-use read/manage side of the feature.
 */

function visibilityWhere(ctx: TenantContext): Prisma.NotificationWhereInput {
  return { businessId: ctx.businessId, OR: [{ userId: null }, { userId: ctx.user.id }] };
}

export const notificationService = {
  async list(ctx: TenantContext, filter: NotificationFilter) {
    const where: Prisma.NotificationWhereInput = {
      ...visibilityWhere(ctx),
      ...(filter.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...visibilityWhere(ctx), readAt: null } }),
    ]);

    return {
      items,
      total,
      page: filter.page,
      totalPages: Math.max(1, Math.ceil(total / filter.perPage)),
      unreadCount,
    };
  },

  async unreadCount(ctx: TenantContext) {
    const count = await prisma.notification.count({ where: { ...visibilityWhere(ctx), readAt: null } });
    return { count };
  },

  async markRead(ctx: TenantContext, id: string) {
    const notification = await prisma.notification.findFirst({ where: { id, ...visibilityWhere(ctx) } });
    if (!notification) throw new NotFoundError("Notification");
    if (notification.readAt) return notification; // idempotent
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  },

  async markAllRead(ctx: TenantContext) {
    const result = await prisma.notification.updateMany({
      where: { ...visibilityWhere(ctx), readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  },

  async delete(ctx: TenantContext, id: string) {
    const notification = await prisma.notification.findFirst({ where: { id, ...visibilityWhere(ctx) } });
    if (!notification) throw new NotFoundError("Notification");
    await prisma.notification.delete({ where: { id } });
    return { id };
  },

  /** Producer seam — see the module doc comment. Not called anywhere yet. */
  async create(params: {
    businessId: string;
    userId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    return prisma.notification.create({
      data: {
        businessId: params.businessId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
      },
    });
  },
};
