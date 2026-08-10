import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { purchaseReturnSchema } from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/purchases/[id]/return — send received units back to the
 * supplier. purchaseService.processReturn() enforces the returnable-
 * quantity and on-hand-stock guards. URL id is authoritative.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("purchases:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(purchaseReturnSchema, { ...body, purchaseId: id });
    const purchase = await purchaseService.processReturn(ctx, input);
    return ok(purchase, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/purchases/[id]/return");
  }
}
