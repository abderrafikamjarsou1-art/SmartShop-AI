import { fetch as expoFetch } from "expo/fetch";
import { api, API_BASE_URL, getAuthToken } from "./api";

/**
 * AI Assistant API client. Mirrors src/app/api/ai/** exactly — no
 * business logic here.
 *
 * POST /api/ai/chat streams its reply as SSE (text/event-stream), which
 * axios cannot consume in React Native. It's read with `expo/fetch`
 * instead — Expo's own fetch implementation, whose Response.body is a
 * real ReadableStream (verified against node_modules/expo/build/winter/
 * fetch/FetchResponse.d.ts) — so mobile gets the same token-by-token
 * streaming as the web client, not a buffered fake.
 *
 * GET /api/ai/chat (history) and the POST stream both predate this pass
 * and don't use the shared { success, data, requestId } envelope — they
 * return { messages } / SSE frames directly. Left as-is; only consumed
 * here, not changed.
 */

export type AiInsightKind =
  | "weekly"
  | "monthly"
  | "profit"
  | "loss"
  | "growth"
  | "inventory"
  | "expenses"
  | "customers"
  | "suppliers";

export type Conversation = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getAiErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export async function getConversations(): Promise<Conversation[]> {
  const response = await api.get<{ data: Conversation[] }>("/ai/conversations");
  return response.data.data;
}

export async function createConversation(): Promise<Conversation> {
  const response = await api.post<{ data: Conversation }>("/ai/conversations");
  return response.data.data;
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/ai/conversations/${id}`);
}

export async function getInsightPrompt(kind: AiInsightKind): Promise<string> {
  const response = await api.get<{ data: { prompt: string } }>(`/ai/insights/${kind}`);
  return response.data.data.prompt;
}

export async function getConversationHistory(conversationId: string): Promise<ChatMessage[]> {
  const response = await api.get<{ messages: ChatMessage[] }>("/ai/chat", { params: { conversationId } });
  return response.data.messages;
}

export type ChatStreamHandlers = {
  onDelta?: (text: string) => void;
};

/**
 * Sends a message and streams the assistant's reply. Resolves with the
 * full concatenated answer once the stream ends (mirrors what the web
 * client accumulates from the same SSE events).
 */
export async function sendChatMessage(
  conversationId: string,
  message: string,
  handlers: ChatStreamHandlers = {}
): Promise<{ answer: string; toolCalls: string[] }> {
  const token = await getAuthToken();
  const response = await expoFetch(`${API_BASE_URL}/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ conversationId, message }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    let parsedMessage: string | undefined;
    try {
      parsedMessage = JSON.parse(text)?.error;
    } catch {
      // not JSON — fall through to the generic message below
    }
    throw new Error(parsedMessage || "تعذر الاتصال بالمساعد الذكي.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let toolCalls: string[] = [];
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);

      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }

      if (data) {
        const parsed = JSON.parse(data) as { text?: string; toolCalls?: string[]; message?: string };
        if (event === "delta" && typeof parsed.text === "string") {
          answer += parsed.text;
          handlers.onDelta?.(parsed.text);
        } else if (event === "done") {
          toolCalls = Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [];
        } else if (event === "error") {
          streamError = typeof parsed.message === "string" ? parsed.message : "حدث خطأ غير متوقع.";
        }
      }

      frameEnd = buffer.indexOf("\n\n");
    }
  }

  if (streamError) throw new Error(streamError);
  return { answer, toolCalls };
}
