import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { createSaleSchema } from "@/lib/validation/sale";
import { saleService } from "@/services/sale-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/sales — create a sale (POS checkout).
 *
 * All the money/stock/idempotency invariants live in saleService.create():
 * atomic stock decrement, price/cost snapshotting, clientRef idempotency
 * (a retried checkout after a flaky network never double-charges or
 * double-decrements), payment + invoice creation, all in one Serializable
 * transaction. This route only resolves the tenant and validates input —
 * exactly the same pipeline as every other route in this app.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("sales:create");
    const body = await request.json().catch(() => ({}));
    const input = zParse(createSaleSchema, body);
    const sale = await saleService.create(ctx, input);
    return ok(sale, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/sales");
  }
}
