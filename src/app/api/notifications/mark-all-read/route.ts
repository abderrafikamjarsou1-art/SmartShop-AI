import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/tenant";
import { notificationService } from "@/services/notification-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/** POST /api/notifications/mark-all-read — marks every visible unread notification as read. */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireBusiness();
    const result = await notificationService.markAllRead(ctx);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/notifications/mark-all-read");
  }
}
