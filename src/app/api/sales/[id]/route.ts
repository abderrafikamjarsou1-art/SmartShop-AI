import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { saleService } from "@/services/sale-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/sales/[id] — single sale, with items/payments/invoice/customer.
 *
 * Tenant ownership is enforced inside saleService.getById (findFirst scoped
 * by ctx.businessId) — a foreign sale id resolves to NotFoundError, never a
 * cross-tenant leak.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const ctx = await requireBusiness();
    const { id } = await params;
    const sale = await saleService.getById(ctx, zParse(zUuid, id));
    return ok(sale, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/sales/[id]");
  }
}
