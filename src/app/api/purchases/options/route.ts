import { requireRole } from "@/lib/tenant";
import { purchaseService } from "@/services/purchase-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/purchases/options — suppliers + products for the create-PO
 * form's pickers. Reuses purchaseService.getFormOptions() as-is (same
 * data the web PO form uses).
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("purchases:manage");
    const options = await purchaseService.getFormOptions(ctx);
    return ok(options, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/purchases/options");
  }
}
