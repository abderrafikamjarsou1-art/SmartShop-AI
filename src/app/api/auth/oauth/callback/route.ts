import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  cleanupExpiredTickets,
  encryptSessionPayload,
  generateTicket,
  hashTicket,
  ticketExpiryDate,
} from "@/lib/oauth-ticket";
import { HANDOFF_CHALLENGE_COOKIE } from "@/lib/oauth-config";

const MOBILE_REDIRECT = "mobile://auth-callback";

/**
 * GET /api/auth/oauth/callback?code=...
 *
 * Hit by the BROWSER (Supabase redirects here after the provider), in the
 * same browser session that called /oauth/start — so the PKCE-verifier
 * cookie Supabase's SSR client set there, and our own handoff-challenge
 * cookie, are both present on this request. This route never receives the
 * mobile app's own request directly.
 *
 * Never puts the Supabase access/refresh token, the handoff challenge, or
 * a raw provider error message, in the mobile:// redirect — only an opaque
 * one-time ticket (see lib/oauth-ticket.ts) or a stable, non-leaking error
 * code.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${MOBILE_REDIRECT}?error=oauth_missing_code`);
  }

  const cookieStore = await cookies();
  const handoffChallenge = cookieStore.get(HANDOFF_CHALLENGE_COOKIE)?.value;

  // Fail safe: no challenge cookie means this callback didn't originate
  // from a /oauth/start call in this same browser session (or it expired)
  // — issue no ticket at all rather than one nothing can ever bind to.
  if (!handoffChallenge) {
    logger.warn("OAuth callback: missing handoff challenge cookie");
    return NextResponse.redirect(`${MOBILE_REDIRECT}?error=oauth_failed`);
  }

  // Best-effort housekeeping — never allowed to block or fail a real login.
  void cleanupExpiredTickets();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user || !data.session) {
      logger.error("OAuth code exchange failed", { error: error?.message });
      return NextResponse.redirect(`${MOBILE_REDIRECT}?error=oauth_failed`);
    }

    const authUser = data.user;
    const session = data.session;

    // Same upsert shape as the existing email/password login/register
    // routes — the authenticated Supabase user is authoritative; nothing
    // here comes from the mobile app or an untrusted client.
    const user = await prisma.user.upsert({
      where: { id: authUser.id },
      update: {
        email: authUser.email ?? undefined,
        fullName: authUser.user_metadata?.full_name ?? undefined,
        avatarUrl: authUser.user_metadata?.avatar_url ?? undefined,
      },
      create: {
        id: authUser.id,
        email: authUser.email ?? "",
        fullName: authUser.user_metadata?.full_name ?? null,
        avatarUrl: authUser.user_metadata?.avatar_url ?? null,
      },
      include: {
        memberships: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    const rawTicket = generateTicket();
    const ticketHash = hashTicket(rawTicket);

    const { ciphertext, iv, authTag } = encryptSessionPayload(
      {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? null,
      },
      ticketHash,
      user.id,
      handoffChallenge
    );

    await prisma.oAuthHandoffTicket.create({
      data: {
        ticketHash,
        userId: user.id,
        handoffChallenge,
        sessionCiphertext: ciphertext,
        sessionIv: iv,
        sessionAuthTag: authTag,
        ticketExpiresAt: ticketExpiryDate(),
      },
    });

    return NextResponse.redirect(`${MOBILE_REDIRECT}?ticket=${encodeURIComponent(rawTicket)}`);
  } catch (error) {
    logger.error("OAuth callback threw unexpectedly", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.redirect(`${MOBILE_REDIRECT}?error=oauth_failed`);
  } finally {
    cookieStore.delete(HANDOFF_CHALLENGE_COOKIE);
  }
}
