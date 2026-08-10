import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer tests for POST /api/auth/register. Previously had zero
 * coverage. Mocks @/lib/supabase/server and @/lib/prisma — Supabase's
 * own signup logic isn't re-tested here, only this route's request
 * handling: CSRF guard, input validation, rate limiting, the
 * empty-identities duplicate-email quirk, and response shaping.
 */

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { upsert: vi.fn() } },
}));

import { POST } from "../register/route";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const mockedCreateClient = vi.mocked(createClient);
const mockedUpsert = vi.mocked(prisma.user.upsert);

const VALID_PASSWORD = "Passw0rd1";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function supabaseSignUp(result: { user: unknown; session: unknown } | null, error: { message: string } | null) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: result ?? { user: null, session: null }, error }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register — CSRF (regression: H9)", () => {
  it("rejects a cross-origin request with a mismatched Origin header", async () => {
    const response = await POST(
      jsonRequest(
        { fullName: "A", email: "a@b.com", password: VALID_PASSWORD },
        { origin: "https://evil.com" }
      )
    );
    expect(response.status).toBe(403);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("allows a request with no Origin/Referer at all (mobile clients send neither)", async () => {
    mockedCreateClient.mockResolvedValue(supabaseSignUp(null, { message: "Invalid" }) as never);
    const response = await POST(jsonRequest({ fullName: "A", email: "mobile-signup@b.com", password: VALID_PASSWORD }));
    expect(response.status).not.toBe(403); // reached real validation/signup, not blocked at CSRF
  });
});

describe("POST /api/auth/register — validation", () => {
  it("rejects a weak password with 400 and field errors", async () => {
    const response = await POST(jsonRequest({ fullName: "A", email: "a@b.com", password: "weak" }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.fieldErrors).toHaveProperty("password");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed request body with 400", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      })
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/register — signup outcomes", () => {
  it("maps a duplicate-email Supabase error to 409", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseSignUp(null, { message: "User already registered" }) as never
    );
    const response = await POST(jsonRequest({ fullName: "A", email: "dup@b.com", password: VALID_PASSWORD }));
    expect(response.status).toBe(409);
  });

  it("maps the empty-identities quirk (re-signup of a confirmed email) to 409", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseSignUp({ user: { id: "u1", email: "dup2@b.com", identities: [] }, session: null }, null) as never
    );
    const response = await POST(jsonRequest({ fullName: "A", email: "dup2@b.com", password: VALID_PASSWORD }));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.message).toMatch(/مستخدم بالفعل/);
  });

  it("returns 201 with needsVerification when Supabase returns no session", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseSignUp({ user: { id: "u1", email: "new@b.com", identities: [{ id: "1" }] }, session: null }, null) as never
    );
    mockedUpsert.mockResolvedValue({
      id: "u1", email: "new@b.com", fullName: "New User", avatarUrl: null, isSuperAdmin: false,
    } as never);

    const response = await POST(jsonRequest({ fullName: "New User", email: "new@b.com", password: VALID_PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.needsVerification).toBe(true);
    expect(body.token).toBeNull();
  });

  it("returns 201 with a token when Supabase returns an immediate session", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseSignUp(
        {
          user: { id: "u2", email: "instant@b.com", identities: [{ id: "1" }] },
          session: { access_token: "tok", refresh_token: "ref", expires_at: 123 },
        },
        null
      ) as never
    );
    mockedUpsert.mockResolvedValue({
      id: "u2", email: "instant@b.com", fullName: "Instant User", avatarUrl: null, isSuperAdmin: false,
    } as never);

    const response = await POST(jsonRequest({ fullName: "Instant User", email: "instant@b.com", password: VALID_PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.needsVerification).toBe(false);
    expect(body.token).toBe("tok");
  });
});

describe("POST /api/auth/register — rate limiting", () => {
  it("throws 429 after repeated attempts from the same ip", async () => {
    mockedCreateClient.mockResolvedValue(supabaseSignUp(null, { message: "Invalid" }) as never);

    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await POST(jsonRequest({ fullName: "A", email: `rate-limit-${i}@b.com`, password: VALID_PASSWORD }));
    }

    expect(last!.status).toBe(429);
  });
});
