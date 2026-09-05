import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, rejectForgedOrigin } from "@/lib/rate-limit";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { computeHandoffChallenge, decryptSessionPayload, hashTicket } from "@/lib/oauth-ticket";

type CompleteBody = {
  ticket?: unknown;
  handoffVerifier?: unknown;
};

type TicketRow = {
  userId: string;
  handoffChallenge: string;
  sessionCiphertext: string;
  sessionIv: string;
  sessionAuthTag: string;
};

// generateTicket() produces 32 random bytes as base64url — 43 characters,
// no padding. A generous range (not an exact-length check) tolerates that
// shape without hardcoding an implementation detail as a hard contract.
const TICKET_FORMAT = /^[A-Za-z0-9_-]{20,128}$/;
// The mobile app currently encodes handoffVerifier as 64 lowercase hex
// characters, but this validates against RFC 7636's PKCE code_verifier
// unreserved character set (A-Z a-z 0-9 - . _ ~, 43-128 chars) instead of
// hardcoding that one encoding — any future encoding change on the mobile
// side (e.g. base64url) stays valid here without a backend change, since
// hex is already a strict subset of this character set.
const VERIFIER_FORMAT = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * POST /api/auth/oauth/complete
 *
 * Called by the mobile app's normal Axios client (unlike /start and
 * /callback, which only ever see browser-context requests) — this is the
 * one point where the native app re-enters the picture, handing back both
 * the opaque ticket the /callback redirect gave it AND the handoffVerifier
 * it generated in memory before starting the flow. Pre-authentication:
 * there is no session yet, so no Bearer token is required or expected.
 *
 * The verifier is what proves this caller is the same app instance that
 * started the OAuth attempt — someone who only intercepts the
 * mobile://auth-callback deep link (not an OS-verified HTTPS App Link) has
 * the ticket but not the verifier, and cannot complete the exchange.
 */
export async function POST(request: Request) {
  try {
    rejectForgedOrigin(request);

    const ip = getClientIp(request.headers);
    assertRateLimit(`oauth-complete:${ip}`, 20, 60_000);

    let body: CompleteBody;
    try {
      body = (await request.json()) as CompleteBody;
    } catch {
      return NextResponse.json({ message: "الطلب غير صالح." }, { status: 400 });
    }

    const rawTicket = typeof body.ticket === "string" ? body.ticket : "";
    const handoffVerifier = typeof body.handoffVerifier === "string" ? body.handoffVerifier : "";

    if (!TICKET_FORMAT.test(rawTicket) || !VERIFIER_FORMAT.test(handoffVerifier)) {
      return NextResponse.json({ message: "طلب تسجيل الدخول غير صالح." }, { status: 400 });
    }

    const ticketHash = hashTicket(rawTicket);
    const computedChallenge = computeHandoffChallenge(handoffVerifier);

    // Atomic claim: DELETE ... RETURNING, with BOTH the ticket hash AND the
    // recomputed challenge in the WHERE clause — a wrong handoffVerifier
    // (right ticket, wrong verifier) matches zero rows and does NOT delete
    // the legitimate row, so the real app instance can still redeem it
    // afterward. Every other caller (a retry, a replay, an intercepted
    // ticket with no verifier, a race) also simply matches zero rows.
    const rows = await prisma.$queryRaw<TicketRow[]>`
      DELETE FROM "oauth_handoff_tickets"
      WHERE "ticketHash" = ${ticketHash}
        AND "handoffChallenge" = ${computedChallenge}
        AND "ticketExpiresAt" > now()
      RETURNING "userId", "handoffChallenge", "sessionCiphertext", "sessionIv", "sessionAuthTag"
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "انتهت صلاحية جلسة تسجيل الدخول. يرجى المحاولة مرة أخرى." },
        { status: 401 }
      );
    }

    const row = rows[0];
    const session = decryptSessionPayload(row, ticketHash, row.userId, row.handoffChallenge);

    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      include: {
        memberships: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    if (!user) {
      // The callback upserted this row moments ago — this should be
      // unreachable, but fail closed rather than return a tokenless user.
      logger.error("OAuth complete: user vanished between callback and complete");
      return NextResponse.json({ message: "حدث خطأ أثناء تسجيل الدخول." }, { status: 500 });
    }

    const membership = user.memberships[0] ?? null;

    return NextResponse.json(
      {
        message: "تم تسجيل الدخول بنجاح.",
        token: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          name: user.fullName ?? user.email.split("@")[0],
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isSuperAdmin: user.isSuperAdmin,
          role: membership?.role ?? null,
          businessId: membership?.businessId ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (isApiError(error)) {
      const message = error.statusCode === 429 ? "محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقة." : "الطلب مرفوض.";
      return NextResponse.json({ message }, { status: error.statusCode });
    }

    logger.error("OAuth complete threw unexpectedly", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json({ message: "حدث خطأ أثناء تسجيل الدخول." }, { status: 500 });
  }
}
