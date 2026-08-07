import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { updateDraftPurchaseSchema } from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET   /api/purchases/[id] — full purchase order (supplier, items,
 *       receipts).
 * PATCH /api/purchases/[id] — update a DRAFT's lines. purchaseService
 *       itself refuses this once the PO has been sent (ValidationError)
 *       — not re-implemented here.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("purchases:manage");
    const { id } = await params;
    const purchase = await purchaseService.getById(ctx, zParse(zUuid, id));
    return ok(purchase, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/purchases/[id]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("purchases:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(updateDraftPurchaseSchema, { ...body, id });
    const purchase = await purchaseService.updateDraft(ctx, input);
    return ok(purchase, requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/purchases/[id]");
  }
}
