import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { createCustomerSchema, customerFilterSchema } from "@/lib/validation/contact";
import { customerService } from "@/services/customer-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/customers — paginated, filtered, searched list.
 * POST /api/customers — create.
 * Same pipeline as every other route: requireRole -> Zod -> customerService.
 * "customers:manage" is the only customer permission (no separate "view" —
 * matches customerService/permissions.ts as-is).
 */

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("customers:manage");
    const filter = zParse(customerFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await customerService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/customers");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("customers:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(createCustomerSchema, body);
    const customer = await customerService.create(ctx, input);
    return ok(customer, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/customers");
  }
}
