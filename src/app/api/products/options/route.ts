import { requireRole } from "@/lib/tenant";
import { productService } from "@/services/product-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/products/options — categories + suppliers for the product
 * create/edit form's pickers. Reuses productService.getFilterOptions()
 * (already used by the web filter bar) — no new query logic.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("products:view");
    const options = await productService.getFilterOptions(ctx);
    return ok(options, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/products/options");
  }
}
