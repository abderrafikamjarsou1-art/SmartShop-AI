import "server-only";
import type { Prisma, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenant";

/**
 * Low-stock alerts — the single hook every stock-changing operation calls
 * (inside its transaction, right after quantity changes).
 *
 * Behaviour:
 *  - stock at/below minimum  -> create ONE unread LOW_STOCK notification
 *    (dedupe: if an unread alert for this product exists, do nothing)
 *  - stock replenished above minimum -> auto-resolve (mark read) any
 *    open alerts for this product
 *
 * Taking the tx client keeps the alert consistent with the stock change:
 * if the adjustment rolls back, so does the notification.
 */
export async function syncLowStockAlert(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  product: { id: string; name: string; quantity: number; minimumStock: number }
) {
  const link = `/products?q=${encodeURIComponent(product.name)}`;
  const openAlert = await tx.notification.findFirst({
    where: {
      businessId: ctx.businessId,
      type: "LOW_STOCK",
      readAt: null,
      link: { contains: product.id }, // product id embedded in the link for lookup
    },
    select: { id: true },
  });

  const isLow = product.quantity <= product.minimumStock;

  if (isLow && !openAlert) {
    await tx.notification.create({
      data: {
        businessId: ctx.businessId,
        userId: null, // broadcast: every member sees it
        type: "LOW_STOCK",
        title: product.quantity === 0 ? `Out of stock: ${product.name}` : `Low stock: ${product.name}`,
        message: `${product.quantity} left (minimum ${product.minimumStock}).`,
        link: `${link}&pid=${product.id}`,
      },
    });
  } else if (!isLow && openAlert) {
    // Replenished -> resolve automatically
    await tx.notification.update({
      where: { id: openAlert.id },
      data: { readAt: new Date() },
    });
  }
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Recent notifications for the topbar bell: business broadcasts
 * (userId null) plus any targeted at the current user, newest first.
 * Read-only surface over rows written by syncLowStockAlert, the sale/
 * purchase services, and admin broadcasts. Scoped by businessId.
 */
export async function listRecentNotifications(
  ctx: TenantContext,
  limit = 12
): Promise<{ items: NotificationView[]; unread: number }> {
  const where: Prisma.NotificationWhereInput = {
    businessId: ctx.businessId,
    OR: [{ userId: null }, { userId: ctx.user.id }],
  };

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, type: true, title: true, message: true,
        link: true, readAt: true, createdAt: true,
      },
    }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return { items, unread };
}
