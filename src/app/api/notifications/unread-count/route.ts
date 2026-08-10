import { requireBusiness } from "@/lib/tenant";
import { notificationService } from "@/services/notification-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/** GET /api/notifications/unread-count — lightweight poll for a badge. */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireBusiness();
    const result = await notificationService.unreadCount(ctx);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/notifications/unread-count");
  }
}
