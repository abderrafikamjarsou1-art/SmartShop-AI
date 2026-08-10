import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { notificationService } from "@/services/notification-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * PATCH  /api/notifications/[id] — mark as read (idempotent).
 * DELETE /api/notifications/[id] — remove a notification.
 */

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireBusiness();
    const { id } = await params;
    const notification = await notificationService.markRead(ctx, zParse(zUuid, id));
    return ok(notification, requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/notifications/[id]");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireBusiness();
    const { id } = await params;
    const result = await notificationService.delete(ctx, zParse(zUuid, id));
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "DELETE /api/notifications/[id]");
  }
}
