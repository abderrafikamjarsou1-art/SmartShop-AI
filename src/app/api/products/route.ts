import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { createProductSchema, productFilterSchema } from "@/lib/validation/product";
import { productService } from "@/services/product-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/products — paginated, filtered, searched list.
 * POST /api/products — create.
 *
 * Same security pipeline as every other route in this app:
 * requireRole -> Zod -> productService. The mobile client is treated as
 * fully untrusted: businessId/userId/role/tenantId are never read from the
 * request — requireRole() resolves them server-side from the verified
 * bearer token (or session cookie for the web client), exactly like every
 * other authenticated route.
 */

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("products:view");
    const filter = zParse(productFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await productService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/products");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    // Cookie-authed (web) requests need CSRF protection; the mobile client
    // sends a bearer token and no Origin/Referer, so it's exempt — same
    // pattern as /api/ai/chat.
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("products:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(createProductSchema, body);
    const product = await productService.create(ctx, input);
    return ok(product, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/products");
  }
}
