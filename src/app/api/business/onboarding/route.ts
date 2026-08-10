import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { zParse } from "@/lib/validation";
import { createBusinessSchema } from "@/lib/validation/business";
import { businessService } from "@/services/business-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/business/onboarding — mobile's first-run onboarding. A
 * freshly registered user has no UserBusiness row yet, so requireBusiness()
 * throws NotFoundError("Business") anywhere else in the API — this is
 * the ONE route reachable with no business at all.
 *
 * Identity: requireAuth() resolves the user from the verified session
 * (bearer token for mobile) — a userId/businessId/ownerId in the body is
 * never read or trusted.
 *
 * Idempotent by design: if the caller already has a membership (e.g. a
 * retried submit, or they onboarded on another device moments earlier),
 * this returns that EXISTING business instead of creating a second one.
 * This is deliberately narrower than businessService.create() itself —
 * the web "add another business" flow (/onboarding?new=1, the business
 * switcher's "New business" link) still calls businessService.create()
 * directly via the createBusiness Server Action, unrestricted, since
 * multi-business is a real supported feature. This route's contract is
 * specifically "set up MY first shop," not "create A shop."
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const user = await requireAuth();

    const existing = await businessService.findFirstMembership(user.id);
    if (existing) {
      return ok(
        {
          business: {
            id: existing.business.id,
            name: existing.business.name,
            currency: existing.business.currency,
            timezone: existing.business.timezone,
            taxRate: Number(existing.business.taxRate),
          },
          role: existing.role,
          alreadyExists: true,
        },
        requestId
      );
    }

    const body = await request.json().catch(() => ({}));
    const input = zParse(createBusinessSchema, body);
    const business = await businessService.create(user, input);

    return ok(
      {
        business: {
          id: business.id,
          name: business.name,
          currency: business.currency,
          timezone: business.timezone,
          taxRate: Number(business.taxRate),
        },
        role: "OWNER" as const,
        alreadyExists: false,
      },
      requestId,
      201
    );
  } catch (error) {
    return fail(error, requestId, "POST /api/business/onboarding");
  }
}
