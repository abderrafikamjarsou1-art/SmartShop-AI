import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { updateBusinessSchema } from "@/lib/validation/business";
import { businessService } from "@/services/business-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

function shapeBusiness(business: { id: string; name: string; currency: string; timezone: string; taxRate: unknown }) {
  return {
    id: business.id,
    name: business.name,
    currency: business.currency,
    timezone: business.timezone,
    taxRate: Number(business.taxRate),
  };
}

/**
 * GET   /api/business — current business profile (Settings screen).
 * PATCH /api/business — edit it.
 *
 * Both gated by settings:manage (OWNER/ADMIN only) — matches the
 * permission the schema already reserves for exactly this. `id` is
 * always ctx.businessId, resolved server-side; nothing from the client
 * can retarget the write to another tenant.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("settings:manage");
    return ok(shapeBusiness(ctx.business), requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/business");
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("settings:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(updateBusinessSchema, body);
    const business = await businessService.update(ctx, input);
    return ok(shapeBusiness(business), requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/business");
  }
}
