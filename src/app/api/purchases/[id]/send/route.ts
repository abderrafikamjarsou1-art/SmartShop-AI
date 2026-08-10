import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { purchaseService } from "@/services/purchase-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/** POST /api/purchases/[id]/send — DRAFT -> ORDERED. purchaseService.send(). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("purchases:manage");
    const { id } = await params;
    const purchase = await purchaseService.send(ctx, zParse(zUuid, id));
    return ok(purchase, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/purchases/[id]/send");
  }
}
