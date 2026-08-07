import { requireRole } from "@/lib/tenant";
import { inventoryService } from "@/services/inventory-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/inventory/dashboard — stock value (cost/retail), product count,
 * low-stock/out-of-stock counts, recent adjustments. Reuses
 * inventoryService.getDashboardStats() as-is (same data as the web
 * inventory overview).
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("inventory:view");
    const stats = await inventoryService.getDashboardStats(ctx);
    return ok(stats, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/inventory/dashboard");
  }
}
