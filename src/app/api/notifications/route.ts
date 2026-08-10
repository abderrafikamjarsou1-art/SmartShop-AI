import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { notificationFilterSchema } from "@/lib/validation/notification";
import { notificationService } from "@/services/notification-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/notifications — paginated list for the current user, scoped to
 * their business (also returns unreadCount for the badge). No dedicated
 * permission — every business member manages their own notifications.
 */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireBusiness();
    const filter = zParse(notificationFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await notificationService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/notifications");
  }
}
