import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { movementFilterSchema } from "@/lib/validation/inventory";
import { inventoryService } from "@/services/inventory-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/inventory/movements — the stock ledger. Search (q: product
 * name/SKU/reason), filters (productId, supplierId, userId, type, date
 * range), pagination — all handled by inventoryService.listMovements(),
 * unchanged.
 */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("inventory:view");
    const filter = zParse(movementFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await inventoryService.listMovements(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/inventory/movements");
  }
}
