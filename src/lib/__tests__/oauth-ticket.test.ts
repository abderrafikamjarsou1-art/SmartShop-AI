import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the OAuth handoff-ticket crypto helpers — generation,
 * hashing, handoff-challenge validation/derivation, AES-256-GCM
 * encrypt/decrypt (including tamper detection via the auth tag and AAD
 * binding to ticketHash+userId+handoffChallenge), and best-effort
 * expired-ticket cleanup. Route-level behavior (start/callback/complete)
 * is covered separately.
 */

process.env.OAUTH_HANDOFF_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { oAuthHandoffTicket: { deleteMany: vi.fn() } },
}));

import {
  generateTicket,
  hashTicket,
  isValidHandoffChallenge,
  computeHandoffChallenge,
  encryptSessionPayload,
  decryptSessionPayload,
  ticketExpiryDate,
  cleanupExpiredTickets,
} from "../oauth-ticket";
import { prisma } from "@/lib/prisma";

const mockedDeleteMany = vi.mocked(prisma.oAuthHandoffTicket.deleteMany);

beforeEach(() => {
  vi.clearAllMocks();
});

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

describe("generateTicket / hashTicket", () => {
  it("generates a high-entropy, base64url ticket", () => {
    const ticket = generateTicket();
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ticket.length).toBeGreaterThan(30); // 32 random bytes, base64url
  });

  it("generates a different ticket every call", () => {
    const a = generateTicket();
    const b = generateTicket();
    expect(a).not.toBe(b);
  });

  it("hashes the same ticket to the same value deterministically", () => {
    const ticket = generateTicket();
    expect(hashTicket(ticket)).toBe(hashTicket(ticket));
  });

  it("hashes different tickets to different values", () => {
    expect(hashTicket(generateTicket())).not.toBe(hashTicket(generateTicket()));
  });

  it("never stores/returns the raw ticket from the hash", () => {
    const ticket = generateTicket();
    expect(hashTicket(ticket)).not.toContain(ticket);
  });
});

describe("isValidHandoffChallenge / computeHandoffChallenge", () => {
  it("cross-runtime known vector: matches the mobile side's computeHandoffChallenge exactly", () => {
    // This exercises the REAL, unmocked implementation (plain Node
    // crypto.createHash — no native module involved on the backend), so
    // this is a genuine end-to-end assertion, not a mocked stand-in. The
    // equivalent mobile-side test (mobile/lib/__tests__/oauth-handoff.
    // test.ts) asserts the identical expected string, proving the two
    // runtimes' implementations agree byte-for-byte on this vector.
    const KNOWN_VERIFIER = "a".repeat(64);
    const EXPECTED_CHALLENGE = "_-BU_nrgy23GXDr5th1SCfQ5hR20PQulmXM33xVGaOs";

    expect(computeHandoffChallenge(KNOWN_VERIFIER)).toBe(EXPECTED_CHALLENGE);
  });

  it("accepts a well-formed base64url(SHA-256(...)) challenge (43 chars)", () => {
    const challenge = computeHandoffChallenge(generateTicket());
    expect(challenge).toHaveLength(43);
    expect(isValidHandoffChallenge(challenge)).toBe(true);
  });

  it("rejects a missing challenge", () => {
    expect(isValidHandoffChallenge(null)).toBe(false);
    expect(isValidHandoffChallenge(undefined)).toBe(false);
    expect(isValidHandoffChallenge("")).toBe(false);
  });

  it("rejects a malformed challenge (wrong length)", () => {
    expect(isValidHandoffChallenge("too-short")).toBe(false);
    expect(isValidHandoffChallenge("a".repeat(44))).toBe(false);
  });

  it("rejects a malformed challenge (invalid charset)", () => {
    expect(isValidHandoffChallenge("!".repeat(43))).toBe(false);
  });

  it("derives the same challenge from the same verifier deterministically", () => {
    const verifier = generateTicket();
    expect(computeHandoffChallenge(verifier)).toBe(computeHandoffChallenge(verifier));
  });

  it("derives different challenges from different verifiers", () => {
    expect(computeHandoffChallenge(generateTicket())).not.toBe(computeHandoffChallenge(generateTicket()));
  });
});

describe("encryptSessionPayload / decryptSessionPayload", () => {
  const payload = { accessToken: "at-123", refreshToken: "rt-456", expiresAt: 1999999999 };

  // encryptSessionPayload returns {ciphertext, iv, authTag}; the Prisma row
  // (and therefore decryptSessionPayload's input) uses the
  // sessionCiphertext/sessionIv/sessionAuthTag column names — this mirrors
  // the field mapping the callback/complete routes do for real.
  function toRow(encrypted: { ciphertext: string; iv: string; authTag: string }) {
    return {
      sessionCiphertext: encrypted.ciphertext,
      sessionIv: encrypted.iv,
      sessionAuthTag: encrypted.authTag,
    };
  }

  it("round-trips the exact payload", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());

    const encrypted = encryptSessionPayload(payload, ticketHash, USER_ID, challenge);
    const decrypted = decryptSessionPayload(toRow(encrypted), ticketHash, USER_ID, challenge);

    expect(decrypted).toEqual(payload);
  });

  it("produces a different ciphertext/iv each time (fresh random IV)", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());

    const first = encryptSessionPayload(payload, ticketHash, USER_ID, challenge);
    const second = encryptSessionPayload(payload, ticketHash, USER_ID, challenge);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("fails decryption when the auth tag has been tampered with", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());
    const row = toRow(encryptSessionPayload(payload, ticketHash, USER_ID, challenge));

    const tampered = { ...row, sessionAuthTag: Buffer.alloc(16, 9).toString("base64") };

    expect(() => decryptSessionPayload(tampered, ticketHash, USER_ID, challenge)).toThrow();
  });

  it("fails decryption when the ciphertext has been tampered with", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());
    const row = toRow(encryptSessionPayload(payload, ticketHash, USER_ID, challenge));

    const tamperedBuf = Buffer.from(row.sessionCiphertext, "base64");
    tamperedBuf[0] = tamperedBuf[0] ^ 0xff;

    expect(() =>
      decryptSessionPayload({ ...row, sessionCiphertext: tamperedBuf.toString("base64") }, ticketHash, USER_ID, challenge)
    ).toThrow();
  });

  it("fails decryption when the AAD userId doesn't match the row it was encrypted for", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());
    const row = toRow(encryptSessionPayload(payload, ticketHash, USER_ID, challenge));

    expect(() => decryptSessionPayload(row, ticketHash, OTHER_USER_ID, challenge)).toThrow();
  });

  it("fails decryption when the AAD handoffChallenge doesn't match (the core app-instance-binding guarantee)", () => {
    const ticketHash = hashTicket(generateTicket());
    const challenge = computeHandoffChallenge(generateTicket());
    const row = toRow(encryptSessionPayload(payload, ticketHash, USER_ID, challenge));

    const wrongChallenge = computeHandoffChallenge(generateTicket());
    expect(() => decryptSessionPayload(row, ticketHash, USER_ID, wrongChallenge)).toThrow();
  });

  it("throws a clear error when the encryption key env var is missing", () => {
    const original = process.env.OAUTH_HANDOFF_ENCRYPTION_KEY;
    delete process.env.OAUTH_HANDOFF_ENCRYPTION_KEY;

    expect(() => encryptSessionPayload(payload, "h", "u", "c")).toThrow(/OAUTH_HANDOFF_ENCRYPTION_KEY/);

    process.env.OAUTH_HANDOFF_ENCRYPTION_KEY = original;
  });
});

describe("ticketExpiryDate", () => {
  it("returns a future timestamp roughly 3 minutes out", () => {
    const now = Date.now();
    const expiry = ticketExpiryDate().getTime();
    const deltaMinutes = (expiry - now) / 60_000;
    expect(deltaMinutes).toBeGreaterThan(2.9);
    expect(deltaMinutes).toBeLessThan(3.1);
  });
});

describe("cleanupExpiredTickets", () => {
  it("deletes rows past their ticketExpiresAt", async () => {
    mockedDeleteMany.mockResolvedValue({ count: 2 });
    await cleanupExpiredTickets();
    expect(mockedDeleteMany).toHaveBeenCalledWith({
      where: { ticketExpiresAt: { lt: expect.any(Date) } },
    });
  });

  it("never throws even if the delete fails (best-effort only)", async () => {
    mockedDeleteMany.mockRejectedValue(new Error("db unreachable"));
    await expect(cleanupExpiredTickets()).resolves.toBeUndefined();
  });
});
