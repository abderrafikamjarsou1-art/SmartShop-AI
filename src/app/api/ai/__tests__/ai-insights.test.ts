import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenant", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/ai-service", () => ({
  aiService: { insightPrompt: vi.fn() },
}));

import { GET } from "../insights/[kind]/route";
import { requireRole } from "@/lib/tenant";
import { aiService } from "@/services/ai-service";
import { UnauthorizedError } from "@/lib/errors";

const ctx = {
  user: { id: "user-1" },
  business: { id: "biz-1" },
  role: "MANAGER",
  businessId: "biz-1",
} as never;

function jsonRequest(url: string) {
  return new NextRequest(url, { method: "GET", headers: { authorization: "Bearer test-token" } });
}

function withKind(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/ai/insights/[kind]", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());

    const response = await GET(jsonRequest("http://localhost/api/ai/insights/weekly"), withKind("weekly"));
    expect(response.status).toBe(401);
    expect(aiService.insightPrompt).not.toHaveBeenCalled();
  });

  it("returns the canned prompt for a known insight kind", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);
    vi.mocked(aiService.insightPrompt).mockReturnValue("Prepare my weekly business summary...");

    const response = await GET(jsonRequest("http://localhost/api/ai/insights/weekly"), withKind("weekly"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.prompt).toBe("Prepare my weekly business summary...");
    expect(aiService.insightPrompt).toHaveBeenCalledWith("weekly");
  });

  it("returns a structured validation error for an unknown kind — never calls the service", async () => {
    vi.mocked(requireRole).mockResolvedValue(ctx);

    const response = await GET(jsonRequest("http://localhost/api/ai/insights/bogus"), withKind("bogus"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(aiService.insightPrompt).not.toHaveBeenCalled();
  });
});
