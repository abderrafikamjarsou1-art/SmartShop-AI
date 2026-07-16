import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";

/**
 * Audit writer. Takes the transaction client so the audit entry commits
 * (or rolls back) atomically with the change it describes — an audited
 * action can never exist without its log, and vice versa.
 */
export async function audit(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  action: string,          // "product.create"
  entity: string,          // "Product"
  entityId: string,
  metadata?: Prisma.InputJsonValue
) {
  await tx.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.user.id,
      action,
      entity,
      entityId,
      metadata,
    },
  });
}
