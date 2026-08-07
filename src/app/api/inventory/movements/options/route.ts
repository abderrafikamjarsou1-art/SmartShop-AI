import { requireRole } from "@/lib/tenant";
import { inventoryService } from "@/services/inventory-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/inventory/movements/options — this tenant's products, team
 * members and suppliers, for the movements filter pickers. Reuses
 * inventoryService.getLedgerFilterOptions() as-is.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("inventory:view");
    const options = await inventoryService.getLedgerFilterOptions(ctx);
    return ok(options, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/inventory/movements/options");
  }
}
