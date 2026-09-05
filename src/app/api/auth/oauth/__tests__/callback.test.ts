import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer tests for GET /api/auth/oauth/callback. Mocks
 * @/lib/supabase/server, @/lib/prisma, and next/headers's cookies() —
 * verifies request handling (missing code, missing handoff-challenge
 * cookie issuing no ticket, exchange failure never leaking Supabase's raw
 * error, successful ticket issuance with the challenge persisted) without
 * touching real crypto/DB internals beyond what oauth-ticket.ts itself
 * already unit-tests.
 */

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.OAUTH_HANDOFF_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: vi.fn() },
    oAuthHandoffTicket: { create: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

const mockCookieGet = vi.fn();
const mockCookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockCookieGet, delete: mockCookieDelete })),
}));

import { GET } from "../callback/route";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { computeHandoffChallenge, generateTicket } from "@/lib/oauth-ticket";

const mockedCreateClient = vi.mocked(createClient);
const mockedUpsert = vi.mocked(prisma.user.upsert);
const mockedTicketCreate = vi.mocked(prisma.oAuthHandoffTicket.create);

const VALID_CHALLENGE = computeHandoffChallenge(generateTicket());

function callbackRequest(query: string) {
  return new Request(`http://localhost:3000/api/auth/oauth/callback?${query}`);
}

function supabaseExchangeClient(
  result: { user: unknown; session: unknown } | null,
  error: { message: string } | null
) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: result ?? { user: null, session: null }, error }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTicketCreate.mockResolvedValue({} as never);
  mockCookieGet.mockReturnValue({ value: VALID_CHALLENGE });
});

describe("GET /api/auth/oauth/callback — missing code", () => {
  it("redirects with a stable error code and never calls Supabase", async () => {
    const response = await GET(callbackRequest(""));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_missing_code");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/oauth/callback — missing handoff-challenge cookie", () => {
  it("issues NO ticket and never calls Supabase when the challenge cookie is absent", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await GET(callbackRequest("code=abc123"));

    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_failed");
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedTicketCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/oauth/callback — exchange failures never leak raw provider details", () => {
  it("redirects to a generic error code when exchangeCodeForSession errors", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseExchangeClient(null, { message: "invalid_grant: PKCE verifier mismatch on internal Supabase node X" }) as never
    );

    const response = await GET(callbackRequest("code=abc123"));
    const location = response.headers.get("location")!;

    expect(location).toBe("mobile://auth-callback?error=oauth_failed");
    expect(location).not.toContain("PKCE");
    expect(location).not.toContain("invalid_grant");
  });

  it("redirects to the generic error code when the exchange returns no session/user", async () => {
    mockedCreateClient.mockResolvedValue(supabaseExchangeClient({ user: null, session: null }, null) as never);
    const response = await GET(callbackRequest("code=abc123"));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_failed");
  });
});

describe("GET /api/auth/oauth/callback — success", () => {
  it("upserts the user, stores an encrypted ticket bound to the handoff challenge, and redirects with only the opaque ticket", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseExchangeClient(
        {
          user: { id: "user-oauth-1", email: "googleuser@b.com", user_metadata: { full_name: "Google User" } },
          session: { access_token: "sb-at", refresh_token: "sb-rt", expires_at: 1999999999 },
        },
        null
      ) as never
    );
    mockedUpsert.mockResolvedValue({
      id: "user-oauth-1",
      email: "googleuser@b.com",
      fullName: "Google User",
      avatarUrl: null,
      isSuperAdmin: false,
      memberships: [],
    } as never);

    const response = await GET(callbackRequest("code=abc123"));
    const location = response.headers.get("location")!;

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-oauth-1" } })
    );

    // Never the raw Supabase tokens, nor the handoff challenge, in the
    // deep-link URL.
    expect(location).not.toContain("sb-at");
    expect(location).not.toContain("sb-rt");
    expect(location).not.toContain(VALID_CHALLENGE);
    expect(location.startsWith("mobile://auth-callback?ticket=")).toBe(true);

    const ticket = new URLSearchParams(location.split("?")[1]).get("ticket")!;
    expect(ticket.length).toBeGreaterThan(30);

    expect(mockedTicketCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockedTicketCreate.mock.calls[0][0] as {
      data: {
        userId: string;
        handoffChallenge: string;
        sessionCiphertext: string;
        sessionIv: string;
        sessionAuthTag: string;
        ticketExpiresAt: Date;
      };
    };
    expect(createArgs.data.userId).toBe("user-oauth-1");
    expect(createArgs.data.handoffChallenge).toBe(VALID_CHALLENGE);
    expect(createArgs.data.sessionCiphertext).not.toContain("sb-at");
    expect(createArgs.data.ticketExpiresAt).toBeInstanceOf(Date);

    // The handoff-challenge cookie is cleared after processing.
    expect(mockCookieDelete).toHaveBeenCalledWith("oauth_handoff_challenge");
  });
});
