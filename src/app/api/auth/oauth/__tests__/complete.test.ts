import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-layer tests for POST /api/auth/oauth/complete. Mocks @/lib/prisma
 * only ($queryRaw for the atomic claim, user.findUnique for the profile) —
 * uses the REAL encrypt/hash/challenge helpers from oauth-ticket.ts so the
 * decrypt-on-complete path, and the handoff-verifier binding, are
 * exercised for real, not just their shape.
 *
 * The "wrong verifier must not delete the legitimate ticket" guarantee is
 * a property of the real SQL (DELETE ... WHERE ticketHash AND
 * handoffChallenge ... RETURNING), which a plain mocked-return-value
 * can't demonstrate — so $queryRaw is mocked here as a tiny in-memory
 * table that only removes a row when BOTH the ticket hash and the
 * recomputed challenge match, mirroring the real WHERE clause.
 */

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.OAUTH_HANDOFF_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
  },
}));

import { POST } from "../complete/route";
import { prisma } from "@/lib/prisma";
import { generateTicket, hashTicket, computeHandoffChallenge, encryptSessionPayload } from "@/lib/oauth-ticket";

const mockedQueryRaw = vi.mocked(prisma.$queryRaw);
const mockedFindUnique = vi.mocked(prisma.user.findUnique);

function completeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/auth/oauth/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type FakeRow = {
  ticketHash: string;
  handoffChallenge: string;
  userId: string;
  sessionCiphertext: string;
  sessionIv: string;
  sessionAuthTag: string;
  ticketExpiresAt: Date;
};

/** Simulates the real atomic DELETE ... WHERE ticketHash AND
 * handoffChallenge ... RETURNING against an in-memory table — a row is
 * only removed (and returned) when both the ticket hash and the
 * recomputed challenge interpolated into the query match a stored row. */
function installFakeAtomicTable(initialRows: FakeRow[]) {
  const table = [...initialRows];
  mockedQueryRaw.mockImplementation((async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const [ticketHash, computedChallenge] = values as [string, string];
    const idx = table.findIndex(
      (r) => r.ticketHash === ticketHash && r.handoffChallenge === computedChallenge && r.ticketExpiresAt > new Date()
    );
    if (idx === -1) return [];
    const [row] = table.splice(idx, 1);
    return [row];
  }) as never);
  return table;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/oauth/complete — input validation", () => {
  it("rejects a missing ticket", async () => {
    const response = await POST(completeRequest({ handoffVerifier: generateTicket() }));
    expect(response.status).toBe(400);
    expect(mockedQueryRaw).not.toHaveBeenCalled();
  });

  it("rejects a missing handoffVerifier", async () => {
    const response = await POST(completeRequest({ ticket: generateTicket() }));
    expect(response.status).toBe(400);
    expect(mockedQueryRaw).not.toHaveBeenCalled();
  });

  it("rejects a malformed ticket (wrong charset/shape)", async () => {
    const response = await POST(
      completeRequest({ ticket: "not a valid ticket!! ***", handoffVerifier: generateTicket() })
    );
    expect(response.status).toBe(400);
    expect(mockedQueryRaw).not.toHaveBeenCalled();
  });

  it("rejects a malformed handoffVerifier", async () => {
    const response = await POST(completeRequest({ ticket: generateTicket(), handoffVerifier: "!!!" }));
    expect(response.status).toBe(400);
    expect(mockedQueryRaw).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/oauth/complete — expired/invalid ticket", () => {
  it("returns a generic 401 when the atomic claim matches zero rows (expired or unknown)", async () => {
    mockedQueryRaw.mockResolvedValue([]);
    const response = await POST(completeRequest({ ticket: generateTicket(), handoffVerifier: generateTicket() }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(typeof body.message).toBe("string");
  });

  it("issues the atomic claim as a single DELETE ... RETURNING statement including handoffChallenge", async () => {
    mockedQueryRaw.mockResolvedValue([]);
    await POST(completeRequest({ ticket: generateTicket(), handoffVerifier: generateTicket() }));

    const [strings] = mockedQueryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    const sql = strings.join("?");
    expect(sql).toMatch(/DELETE FROM/i);
    expect(sql).toMatch(/RETURNING/i);
    expect(sql).toMatch(/"handoffChallenge"/);
    expect(sql).toMatch(/"ticketExpiresAt" > now\(\)/);
  });
});

describe("POST /api/auth/oauth/complete — handoff-verifier binding", () => {
  it("CRITICAL: a wrong handoffVerifier does NOT consume/delete the legitimate ticket, and the correct verifier can still redeem it afterward", async () => {
    const ticket = generateTicket();
    const ticketHash = hashTicket(ticket);
    const correctVerifier = generateTicket();
    const correctChallenge = computeHandoffChallenge(correctVerifier);
    const userId = "user-bind-1";

    const encrypted = encryptSessionPayload(
      { accessToken: "sb-access", refreshToken: "sb-refresh", expiresAt: 123 },
      ticketHash,
      userId,
      correctChallenge
    );

    const table = installFakeAtomicTable([
      {
        ticketHash,
        handoffChallenge: correctChallenge,
        userId,
        sessionCiphertext: encrypted.ciphertext,
        sessionIv: encrypted.iv,
        sessionAuthTag: encrypted.authTag,
        ticketExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    // Attempt #1: an attacker who intercepted only the ticket (no verifier).
    const wrongVerifier = generateTicket();
    const wrongResponse = await POST(completeRequest({ ticket, handoffVerifier: wrongVerifier }));
    expect(wrongResponse.status).toBe(401);
    expect(table).toHaveLength(1); // still there — not consumed by the wrong attempt

    // Attempt #2: the real app instance, with the correct verifier.
    mockedFindUnique.mockResolvedValue({
      id: userId,
      email: "bound@b.com",
      fullName: null,
      avatarUrl: null,
      isSuperAdmin: false,
      memberships: [],
    } as never);

    const correctResponse = await POST(completeRequest({ ticket, handoffVerifier: correctVerifier }));
    expect(correctResponse.status).toBe(200);
    expect(table).toHaveLength(0); // now consumed
  });

  it("an intercepted ticket alone (no verifier at all matching) cannot complete login", async () => {
    const ticket = generateTicket();
    const ticketHash = hashTicket(ticket);
    const correctChallenge = computeHandoffChallenge(generateTicket());

    installFakeAtomicTable([
      {
        ticketHash,
        handoffChallenge: correctChallenge,
        userId: "user-intercept-1",
        sessionCiphertext: "x",
        sessionIv: "x",
        sessionAuthTag: "x",
        ticketExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    // The interceptor doesn't know the verifier — sends an unrelated one.
    const response = await POST(completeRequest({ ticket, handoffVerifier: generateTicket() }));
    expect(response.status).toBe(401);
  });

  it("replay after a successful consume fails, even with the correct verifier", async () => {
    const ticket = generateTicket();
    const ticketHash = hashTicket(ticket);
    const verifier = generateTicket();
    const challenge = computeHandoffChallenge(verifier);
    const userId = "user-replay-1";

    const encrypted = encryptSessionPayload(
      { accessToken: "sb-access", refreshToken: "sb-refresh", expiresAt: null },
      ticketHash,
      userId,
      challenge
    );

    installFakeAtomicTable([
      {
        ticketHash,
        handoffChallenge: challenge,
        userId,
        sessionCiphertext: encrypted.ciphertext,
        sessionIv: encrypted.iv,
        sessionAuthTag: encrypted.authTag,
        ticketExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    mockedFindUnique.mockResolvedValue({
      id: userId,
      email: "replay@b.com",
      fullName: null,
      avatarUrl: null,
      isSuperAdmin: false,
      memberships: [],
    } as never);

    const first = await POST(completeRequest({ ticket, handoffVerifier: verifier }));
    expect(first.status).toBe(200);

    const second = await POST(completeRequest({ ticket, handoffVerifier: verifier }));
    expect(second.status).toBe(401);
  });
});

describe("POST /api/auth/oauth/complete — success", () => {
  it("decrypts the real session payload (AAD-bound to the challenge) and returns the existing LoginResponse shape", async () => {
    const ticket = generateTicket();
    const ticketHash = hashTicket(ticket);
    const verifier = generateTicket();
    const challenge = computeHandoffChallenge(verifier);
    const userId = "user-real-1";

    const encrypted = encryptSessionPayload(
      { accessToken: "sb-access", refreshToken: "sb-refresh", expiresAt: 1888888888 },
      ticketHash,
      userId,
      challenge
    );

    mockedQueryRaw.mockResolvedValue([
      {
        userId,
        handoffChallenge: challenge,
        sessionCiphertext: encrypted.ciphertext,
        sessionIv: encrypted.iv,
        sessionAuthTag: encrypted.authTag,
      },
    ]);
    mockedFindUnique.mockResolvedValue({
      id: userId,
      email: "oauthuser@b.com",
      fullName: "OAuth User",
      avatarUrl: null,
      isSuperAdmin: false,
      memberships: [{ role: "OWNER", businessId: "biz-9" }],
    } as never);

    const response = await POST(completeRequest({ ticket, handoffVerifier: verifier }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token).toBe("sb-access");
    expect(body.refreshToken).toBe("sb-refresh");
    expect(body.expiresAt).toBe(1888888888);
    expect(body.user).toEqual(
      expect.objectContaining({ id: userId, email: "oauthuser@b.com", role: "OWNER", businessId: "biz-9" })
    );
  });

  it("fails closed with a 500 if the ciphertext/challenge combination doesn't authenticate (bad auth tag)", async () => {
    const ticket = generateTicket();
    const ticketHash = hashTicket(ticket);
    const verifier = generateTicket();
    const challenge = computeHandoffChallenge(verifier);
    const userId = "user-real-2";
    const encrypted = encryptSessionPayload(
      { accessToken: "sb-access", refreshToken: "sb-refresh", expiresAt: null },
      ticketHash,
      userId,
      challenge
    );

    mockedQueryRaw.mockResolvedValue([
      {
        userId,
        handoffChallenge: challenge,
        sessionCiphertext: encrypted.ciphertext,
        sessionIv: encrypted.iv,
        sessionAuthTag: Buffer.alloc(16, 1).toString("base64"), // corrupted
      },
    ]);

    const response = await POST(completeRequest({ ticket, handoffVerifier: verifier }));
    expect(response.status).toBe(500); // decrypt throws -> caught by the route's generic error handler
  });
});
