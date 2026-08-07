import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-layer tests for GET/POST /api/ai/conversations and
 * DELETE /api/ai/conversations/[id]. Mocks @/lib/tenant and
 * @/services/ai-service — aiService's own logic (rate limiting, tool
 * calls, summarization) is covered by src/lib/ai/__tests__/ai.test.ts.
 * Verifies auth enforcement and correct service calls only.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/ai-service", () => ({
  aiService: { listConversations: vi.fn(), createConversation: vi.fn(), deleteConversation: vi.fn() },
}));

import { GET, POST } from "../conversations/route";
import { DELETE } from "../conversations/[id]/route";
import { requireRole } from "@/lib/tenant";
import { aiService } from "@/services/ai-service";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function jsonRequest(url: string, method: string) {
  return new NextRequest(url, { method, headers: { authorization: "Bearer test-token" } });
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/ai/conversations", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET();
    expect(response.status).toBe(401);
    expect(aiService.listConversations).not.toHaveBeenCalled();
  });

  it("rejects a role without ai:use", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError());

    const response = await GET();
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("ai:use");
  });

  it("returns the user's recent conversations", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(aiService.listConversations).mockResolvedValue([
      { id: CONVERSATION_ID, title: "Weekly summary", updatedAt: new Date() },
    ] as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(aiService.listConversations).toHaveBeenCalledWith(ctx);
  });
});

describe("POST /api/ai/conversations", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await POST(jsonRequest("http://localhost/api/ai/conversations", "POST"));
    expect(response.status).toBe(401);
    expect(aiService.createConversation).not.toHaveBeenCalled();
  });

  it("creates a new empty conversation and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(aiService.createConversation).mockResolvedValue({ id: CONVERSATION_ID } as never);

    const response = await POST(jsonRequest("http://localhost/api/ai/conversations", "POST"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ id: CONVERSATION_ID });
    expect(aiService.createConversation).toHaveBeenCalledWith(ctx);
  });
});

describe("DELETE /api/ai/conversations/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await DELETE(
      jsonRequest(`http://localhost/api/ai/conversations/${CONVERSATION_ID}`, "DELETE"),
      withId(CONVERSATION_ID)
    );
    expect(response.status).toBe(401);
    expect(aiService.deleteConversation).not.toHaveBeenCalled();
  });

  it("deletes the conversation for the resolved tenant", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(aiService.deleteConversation).mockResolvedValue(undefined as never);

    const response = await DELETE(
      jsonRequest(`http://localhost/api/ai/conversations/${CONVERSATION_ID}`, "DELETE"),
      withId(CONVERSATION_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: CONVERSATION_ID });
    expect(aiService.deleteConversation).toHaveBeenCalledWith(ctx, CONVERSATION_ID);
  });

  it("cross-tenant access: another tenant's conversation id returns 404", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(aiService.deleteConversation).mockRejectedValue(new NotFoundError("Conversation"));

    const response = await DELETE(
      jsonRequest(`http://localhost/api/ai/conversations/${CONVERSATION_ID}`, "DELETE"),
      withId(CONVERSATION_ID)
    );
    expect(response.status).toBe(404);
  });
});
