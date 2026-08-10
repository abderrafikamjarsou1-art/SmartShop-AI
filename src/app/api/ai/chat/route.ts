import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { zUuid } from "@/lib/validation";
import { aiService } from "@/services/ai-service";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";

/**
 * POST /api/ai/chat — streams the assistant's reply as SSE.
 * A route handler (not a server action) because actions can't stream.
 * Same security pipeline as everything else:
 * requireRole -> Zod -> service.
 */

const bodySchema = z.object({
  conversationId: zUuid,
  message: z.string().trim().min(1).max(2000),
});

/** GET /api/ai/chat?conversationId= — load history for the chat pane. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ai:use");
    const conversationId = zUuid.parse(request.nextUrl.searchParams.get("conversationId"));
    const conversation = await aiService.getConversation(ctx, conversationId);
    return NextResponse.json({
      messages: conversation.messages.map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
        tools: Array.isArray(m.toolCalls) ? (m.toolCalls as { tool: string }[]).map((t) => t.tool) : undefined,
      })),
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Failed." }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // CSRF defense for the cookie-authed web client. Mobile clients send
    // `Authorization: Bearer <token>` instead of a cookie and never set
    // Origin/Referer, so they're exempt — there's no session to forge.
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("ai:use");
    const { conversationId, message } = bodySchema.parse(await request.json());

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          const { toolCalls } = await aiService.runTurn(ctx, conversationId, message, (delta) =>
            send("delta", { text: delta })
          );
          send("done", { toolCalls: toolCalls.map((t) => t.tool) });
        } catch (error) {
          const msg = isApiError(error) && error.expose ? error.message : "Something went wrong.";
          if (!isApiError(error)) logger.error("AI turn failed", { error });
          send("error", { message: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Failed." }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
