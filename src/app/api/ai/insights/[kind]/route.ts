import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { aiInsightKindSchema } from "@/lib/validation/ai";
import { aiService } from "@/services/ai-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/ai/insights/[kind] — the canned expert prompt for a one-click
 * insight shortcut (e.g. "weekly", "inventory"). The caller sends the
 * returned prompt through POST /api/ai/chat like any other message — same
 * secure pipeline, no separate code path.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const requestId = newRequestId();
  try {
    await requireRole("ai:use");
    const { kind } = await params;
    const prompt = aiService.insightPrompt(zParse(aiInsightKindSchema, kind));
    return ok({ prompt }, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/ai/insights/[kind]");
  }
}
