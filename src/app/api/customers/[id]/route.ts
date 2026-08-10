import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { updateCustomerSchema } from "@/lib/validation/contact";
import { customerService } from "@/services/customer-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET    /api/customers/[id] — full profile (customer + KPIs + favorite
 *        products + recent sales + recent payments). Returns
 *        customerService.getProfile() as-is — the mobile detail screen
 *        needs the same data the web profile page renders.
 * PATCH  /api/customers/[id] — update.
 * DELETE /api/customers/[id] — soft delete. customerService itself
 *        refuses this while the customer still has an outstanding
 *        balance (ValidationError) — not re-implemented here.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("customers:manage");
    const { id } = await params;
    const profile = await customerService.getProfile(ctx, zParse(zUuid, id));
    return ok(profile, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/customers/[id]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("customers:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(updateCustomerSchema, { ...body, id });
    const customer = await customerService.update(ctx, input);
    return ok(customer, requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/customers/[id]");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("customers:manage");
    const { id } = await params;
    const result = await customerService.softDelete(ctx, zParse(zUuid, id));
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "DELETE /api/customers/[id]");
  }
}
