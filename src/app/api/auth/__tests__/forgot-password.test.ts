import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "../forgot-password/route";
import { createClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createClient);

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function supabaseClient() {
  return { auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/forgot-password — CSRF", () => {
  it("rejects a cross-origin request with a mismatched Origin header", async () => {
    const response = await POST(jsonRequest({ email: "a@b.com" }, { origin: "https://evil.com" }));
    expect(response.status).toBe(403);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("allows a request with no Origin/Referer at all (mobile clients send neither)", async () => {
    mockedCreateClient.mockResolvedValue(supabaseClient() as never);
    const response = await POST(jsonRequest({ email: "mobile-user@b.com" }));
    expect(response.status).toBe(200);
  });
});

describe("POST /api/auth/forgot-password — validation", () => {
  it("rejects a malformed email with 400", async () => {
    const response = await POST(jsonRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed request body with 400", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      })
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/forgot-password — anti-enumeration", () => {
  it("reports success even when Supabase finds no matching user (never reveal existence)", async () => {
    const client = supabaseClient();
    mockedCreateClient.mockResolvedValue(client as never);

    const response = await POST(jsonRequest({ email: "unknown-user@b.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sent).toBe(true);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("unknown-user@b.com", expect.any(Object));
  });
});

describe("POST /api/auth/forgot-password — rate limiting", () => {
  it("throws 429 after repeated attempts for the same ip+email", async () => {
    mockedCreateClient.mockResolvedValue(supabaseClient() as never);
    const email = "rate-limit-forgot@b.com";

    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await POST(jsonRequest({ email }));
    }

    expect(last!.status).toBe(429);
  });
});
