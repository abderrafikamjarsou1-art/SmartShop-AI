import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { adjustStockSchema } from "@/lib/validation/product";
import { productService } from "@/services/product-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/products/[id]/stock — manual stock adjustment.
 * Body: { newQuantity: number, reason: string } — reason is required by
 * adjustStockSchema; productService writes an ADJUSTMENT inventory
 * movement so the ledger always explains the number.
 *
 * Permission is "inventory:manage" (not "products:manage") — matches the
 * web app's adjustProductStock server action (src/actions/products.ts),
 * since a stock count/adjustment is an inventory operation, not a product
 * catalog edit. No behavior difference for current roles (MANAGER+ always
 * has both), but keeps this route consistent with the established RBAC
 * convention instead of drifting from it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("inventory:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(adjustStockSchema, { ...body, id });
    const product = await productService.adjustStock(ctx, input);
    return ok(product, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/products/[id]/stock");
  }
}
