import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { receivePurchaseSchema } from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/purchases/[id]/receive — record a (partial or full) receipt.
 * Idempotent via clientRef (purchaseService.receive()): a retried
 * request with the same clientRef returns the existing state instead of
 * double-incrementing stock. The URL id is authoritative — any
 * purchaseId in the body is overwritten before validation.
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
    const input = zParse(receivePurchaseSchema, { ...body, purchaseId: id });
    const purchase = await purchaseService.receive(ctx, input);
    return ok(purchase, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/purchases/[id]/receive");
  }
}
