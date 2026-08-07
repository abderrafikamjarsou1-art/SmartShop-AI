import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { recordPaymentSchema } from "@/lib/validation/contact";
import { customerService } from "@/services/customer-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * POST /api/customers/[id]/payment — record a payment against the
 * customer's outstanding balance. customerService.recordPayment() does
 * the FIFO allocation to open sales, the store-credit guard, and the
 * balance decrement atomically — all reused as-is.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("customers:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(recordPaymentSchema, { ...body, customerId: id });
    const result = await customerService.recordPayment(ctx, input);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/customers/[id]/payment");
  }
}
