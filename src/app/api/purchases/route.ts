import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { createPurchaseSchema, purchaseFilterSchema } from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/purchases — paginated, filtered, searched list.
 * POST /api/purchases — create (as DRAFT or ORDERED).
 * Same pipeline as every other route: requireRole -> Zod -> purchaseService.
 * "purchases:manage" is the only purchases permission (manager+ only —
 * cashiers/employees don't have it, matching permissions.ts as-is).
 */

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("purchases:manage");
    const filter = zParse(purchaseFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await purchaseService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/purchases");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("purchases:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(createPurchaseSchema, body);
    const purchase = await purchaseService.create(ctx, input);
    return ok(purchase, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/purchases");
  }
}
