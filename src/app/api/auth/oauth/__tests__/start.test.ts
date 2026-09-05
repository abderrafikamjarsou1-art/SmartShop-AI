import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer tests for GET /api/auth/oauth/start. Mocks
 * @/lib/supabase/server and next/headers's cookies() — Supabase's own
 * OAuth logic isn't re-tested here, only this route's provider/challenge
 * validation, cookie-setting, and error handling.
 */

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockCookieSet })),
}));

import { GET } from "../start/route";
import { createClient } from "@/lib/supabase/server";
import { computeHandoffChallenge, generateTicket } from "@/lib/oauth-ticket";

const mockedCreateClient = vi.mocked(createClient);
const VALID_CHALLENGE = computeHandoffChallenge(generateTicket());

function startRequest(query: string) {
  return new Request(`http://localhost:3000/api/auth/oauth/start?${query}`);
}

function supabaseOAuthClient(result: { url: string } | null, error: { message: string } | null) {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ data: result ?? { url: null }, error }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/oauth/start — provider allow-list", () => {
  it("rejects an unsupported provider without ever touching Supabase", async () => {
    const response = await GET(startRequest(`provider=azure&handoff_challenge=${VALID_CHALLENGE}`));
    const location = response.headers.get("location");

    expect(location).toBe("mobile://auth-callback?error=oauth_unsupported_provider");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a missing provider", async () => {
    const response = await GET(startRequest(`handoff_challenge=${VALID_CHALLENGE}`));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_unsupported_provider");
  });

  it("rejects apple (deferred — not yet in the allow-list)", async () => {
    const response = await GET(startRequest(`provider=apple&handoff_challenge=${VALID_CHALLENGE}`));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_unsupported_provider");
  });
});

describe("GET /api/auth/oauth/start — handoff_challenge validation", () => {
  it("rejects a missing handoff_challenge", async () => {
    const response = await GET(startRequest("provider=google"));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_missing_challenge");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed handoff_challenge (wrong length)", async () => {
    const response = await GET(startRequest("provider=google&handoff_challenge=too-short"));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_missing_challenge");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed handoff_challenge (invalid charset)", async () => {
    const response = await GET(startRequest(`provider=google&handoff_challenge=${"!".repeat(43)}`));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_missing_challenge");
  });
});

describe("GET /api/auth/oauth/start — Supabase failures never leak raw details", () => {
  it("redirects to a stable, generic error code when signInWithOAuth errors", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseOAuthClient(null, { message: "some internal Supabase provider misconfiguration detail" }) as never
    );

    const response = await GET(startRequest(`provider=google&handoff_challenge=${VALID_CHALLENGE}`));
    const location = response.headers.get("location")!;

    expect(location).toBe("mobile://auth-callback?error=oauth_start_failed");
    expect(location).not.toContain("misconfiguration");
  });

  it("redirects to the generic error code when Supabase returns no url", async () => {
    mockedCreateClient.mockResolvedValue(supabaseOAuthClient({ url: "" }, null) as never);
    const response = await GET(startRequest(`provider=google&handoff_challenge=${VALID_CHALLENGE}`));
    expect(response.headers.get("location")).toBe("mobile://auth-callback?error=oauth_start_failed");
  });
});

describe("GET /api/auth/oauth/start — success", () => {
  it("redirects the browser straight to Supabase's authorize URL and stores the challenge cookie", async () => {
    mockedCreateClient.mockResolvedValue(
      supabaseOAuthClient({ url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, null) as never
    );

    const response = await GET(startRequest(`provider=google&handoff_challenge=${VALID_CHALLENGE}`));

    expect(response.headers.get("location")).toBe("https://project.supabase.co/auth/v1/authorize?provider=google");
    expect(mockCookieSet).toHaveBeenCalledWith(
      "oauth_handoff_challenge",
      VALID_CHALLENGE,
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" })
    );
  });

  it("passes the fixed production callback as redirectTo, not a dynamic one", async () => {
    const client = supabaseOAuthClient({ url: "https://project.supabase.co/auth/v1/authorize" }, null);
    mockedCreateClient.mockResolvedValue(client as never);

    await GET(startRequest(`provider=google&handoff_challenge=${VALID_CHALLENGE}`));

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://smart-shop-ai-ruby.vercel.app/api/auth/oauth/callback" },
    });
  });
});
