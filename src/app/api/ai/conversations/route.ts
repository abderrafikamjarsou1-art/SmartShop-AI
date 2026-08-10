import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { aiService } from "@/services/ai-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/ai/conversations — the current user's 20 most recent
 *      conversations (id, title, updatedAt). Mirrors the web AI page's
 *      sidebar list.
 * POST /api/ai/conversations — start a new (empty) conversation. Messages
 *      are then sent via POST /api/ai/chat.
 */

export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("ai:use");
    const conversations = await aiService.listConversations(ctx);
    return ok(conversations, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/ai/conversations");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("ai:use");
    const conversation = await aiService.createConversation(ctx);
    return ok(conversation, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/ai/conversations");
  }
}
