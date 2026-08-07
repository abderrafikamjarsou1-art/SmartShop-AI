import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer tests for POST /api/auth/login. Previously had zero
 * coverage despite being the most security-sensitive route in the app.
 * Mocks @/lib/supabase/server and @/lib/prisma — Supabase's own auth
 * logic isn't re-tested here, only this route's request handling:
 * CSRF guard, input validation, rate limiting, and response shaping.
 */

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { upsert: vi.fn() } },
}));

import { POST } from "../login/route";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const mockedCreateClient = vi.mocked(createClient);
const mockedUpsert = vi.mocked(prisma.user.upsert);

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function supabaseReturning(result: { user: unknown; session: unknown } | null, error: { message: string } | null) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: result ?? { user: null, session: null },
        error,
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/login — CSRF (regression: H9)", () => {
  it("rejects a cross-origin request with a mismatched Origin header", async () => {
    const response = await POST(
      jsonRequest({ email: "a@b.com", password: "x" }, { origin: "https://evil.com" })
    );
    expect(response.status).toBe(403);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a mismatched Referer when Origin is absent", async () => {
    const response = await POST(
      jsonRequest({ email: "a@b.com", password: "x" }, { referer: "https://evil.com/steal" })
    );
    expect(response.status).toBe(403);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("allows a same-origin request", async () => {
    mockedCreateClient.mockResolvedValue(supabaseReturning(null, { message: "Invalid" }) as never);
    const response = await POST(
      jsonRequest({ email: "same-origin@b.com", password: "x" }, { origin: "http://localhost:3000" })
    );
    expect(response.status).toBe(401); // reached the real auth check, not blocked at CSRF
  });

  it("allows a request with no Origin/Referer at all (mobile clients send neither)", async () => {
    mockedCreateClient.mockResolvedValue(supabaseReturning(null, { message: "Invalid" }) as never);
    const response = await POST(jsonRequest({ email: "mobile-client@b.com", password: "x" }));
    expect(response.status).toBe(401); // reached the real auth check, not blocked at CSRF
  });
});

describe("POST /api/auth/login — validation", () => {
  it("rejects a missing email/password with 400", async () => {
    const response = await POST(jsonRequest({ email: "", password: "" }));
    expect(response.status).toBe(400);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed email with 400", async () => {
    const response = await POST(jsonRequest({ email: "not-an-email", password: "x" }));
    expect(response.status).toBe(400);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login — authentication outcomes", () => {
  it("returns a generic 401 for wrong credentials — no user enumeration", async () => {
    mockedCreateClient.mockResolvedValue(supabaseReturning(null, { message: "Invalid login credentials" }) as never);
    const response = await POST(jsonRequest({ email: "wrong-creds@b.com", password: "bad" }));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.message).not.toMatch(/user|email/i); // doesn't reveal whether the account exists
  });

  it("returns 200 with a token and user shape on success", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseReturning(
        {
          user: { id: "user-1", email: "owner@b.com", user_metadata: {} },
          session: { access_token: "tok", refresh_token: "ref", expires_at: 123 },
        },
        null
      ) as never
    );
    mockedUpsert.mockResolvedValue({
      id: "user-1", email: "owner@b.com", fullName: null, avatarUrl: null, isSuperAdmin: false,
      memberships: [{ role: "OWNER", businessId: "biz-1" }],
    } as never);

    const response = await POST(jsonRequest({ email: "owner@b.com", password: "correct" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token).toBe("tok");
    expect(body.user).toEqual(
      expect.objectContaining({ id: "user-1", email: "owner@b.com", role: "OWNER", businessId: "biz-1" })
    );
  });
});

describe("POST /api/auth/login — rate limiting", () => {
  it("throws 429 after repeated attempts for the same ip+email", async () => {
    mockedCreateClient.mockResolvedValue(supabaseReturning(null, { message: "Invalid login credentials" }) as never);
    const email = "rate-limit-target@b.com";

    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(jsonRequest({ email, password: "bad" }));
    }

    expect(last!.status).toBe(429);
  });
});
