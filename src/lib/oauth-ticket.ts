import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * One-time mobile OAuth handoff ticket — crypto helpers only (no route
 * logic). The browser-context callback can't hand a Supabase session
 * straight to the native mobile app, so it stores the session here
 * (encrypted) behind an opaque, single-use ticket that the app exchanges
 * via POST /api/auth/oauth/complete. See prisma/schema.prisma's
 * OAuthHandoffTicket doc comment for the full rationale.
 */

const TICKET_TTL_MS = 3 * 60 * 1000; // 3 minutes

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
};

/** Raw, high-entropy ticket — this exact string is the ONLY thing that
 * appears in the mobile://auth-callback deep link. Never store this value
 * itself; only its hash (see hashTicket). */
export function generateTicket(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashTicket(rawTicket: string): string {
  return crypto.createHash("sha256").update(rawTicket, "utf8").digest("hex");
}

// base64url(SHA-256(x)) is always exactly 43 characters (32 bytes, no
// padding) — used for both the app-supplied handoff_challenge (validated
// at /oauth/start) and the challenge this same function recomputes from
// the verifier at /oauth/complete.
const HANDOFF_CHALLENGE_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isValidHandoffChallenge(value: unknown): value is string {
  return typeof value === "string" && HANDOFF_CHALLENGE_FORMAT.test(value);
}

/** Recomputes the challenge from a raw verifier the app sends to
 * /oauth/complete — this is what /oauth/complete compares against the
 * challenge stored on the ticket row (see the atomic DELETE in
 * complete/route.ts), never a stored copy of the verifier itself. */
export function computeHandoffChallenge(handoffVerifier: string): string {
  return crypto.createHash("sha256").update(handoffVerifier, "utf8").digest("base64url");
}

/** AAD binds the ciphertext to the specific row AND the app instance that
 * initiated the flow — even a swapped/relocated ciphertext+iv+authTag from
 * a different row, or a correct row read back with the wrong challenge,
 * fails to decrypt, since the AAD wouldn't match. */
function buildAad(ticketHash: string, userId: string, handoffChallenge: string): Buffer {
  return Buffer.from(`${ticketHash}:${userId}:${handoffChallenge}`, "utf8");
}

function getEncryptionKey(): Buffer {
  const raw = process.env.OAUTH_HANDOFF_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("OAUTH_HANDOFF_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("OAUTH_HANDOFF_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptSessionPayload(
  payload: SessionPayload,
  ticketHash: string,
  userId: string,
  handoffChallenge: string
): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildAad(ticketHash, userId, handoffChallenge));

  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSessionPayload(
  row: { sessionCiphertext: string; sessionIv: string; sessionAuthTag: string },
  ticketHash: string,
  userId: string,
  handoffChallenge: string
): SessionPayload {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.sessionIv, "base64"));
  decipher.setAAD(buildAad(ticketHash, userId, handoffChallenge));
  decipher.setAuthTag(Buffer.from(row.sessionAuthTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.sessionCiphertext, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as SessionPayload;
}

export function ticketExpiryDate(): Date {
  return new Date(Date.now() + TICKET_TTL_MS);
}

/** Best-effort — deliberately swallows its own errors so a cleanup failure
 * can never break the login attempt that triggered it. Logs only a count,
 * never ticket/token data. */
export async function cleanupExpiredTickets(): Promise<void> {
  try {
    const { count } = await prisma.oAuthHandoffTicket.deleteMany({
      where: { ticketExpiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      logger.info("OAuth handoff ticket cleanup", { deletedCount: count });
    }
  } catch (error) {
    logger.warn("OAuth handoff ticket cleanup failed (non-fatal)", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
