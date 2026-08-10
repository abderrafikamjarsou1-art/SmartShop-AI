import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { aiService } from "@/services/ai-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/** DELETE /api/ai/conversations/[id] — delete a conversation and its messages. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("ai:use");
    const { id } = await params;
    await aiService.deleteConversation(ctx, zParse(zUuid, id));
    return ok({ id }, requestId);
  } catch (error) {
    return fail(error, requestId, "DELETE /api/ai/conversations/[id]");
  }
}
