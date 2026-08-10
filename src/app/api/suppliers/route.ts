import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { createSupplierSchema, supplierFilterSchema } from "@/lib/validation/contact";
import { supplierService } from "@/services/supplier-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/suppliers — paginated, filtered, searched list.
 * POST /api/suppliers — create.
 * Mirrors /api/customers exactly. "suppliers:manage" is the only
 * supplier permission (no separate "view").
 */

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("suppliers:manage");
    const filter = zParse(supplierFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await supplierService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/suppliers");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("suppliers:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(createSupplierSchema, body);
    const supplier = await supplierService.create(ctx, input);
    return ok(supplier, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/suppliers");
  }
}
