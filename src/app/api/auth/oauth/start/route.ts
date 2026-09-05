import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { assertRateLimit, getClientIp, TooManyRequestsError } from "@/lib/rate-limit";
import { isSupportedOAuthProvider, OAUTH_CALLBACK_URL, HANDOFF_CHALLENGE_COOKIE } from "@/lib/oauth-config";
import { isValidHandoffChallenge } from "@/lib/oauth-ticket";
import { logger } from "@/lib/logger";

const MOBILE_ERROR_REDIRECT = "mobile://auth-callback";

/**
 * GET /api/auth/oauth/start?provider=google&handoff_challenge=<base64url SHA-256>
 *
 * Browser-navigation entry point — the mobile app opens THIS URL directly
 * with expo-web-browser's openAuthSessionAsync(), never through the
 * Axios/services/api.ts client. That matters: signInWithOAuth() below makes
 * the Supabase SSR client set a PKCE-verifier cookie on THIS response, and
 * only the browser session that receives that cookie can later present it
 * back on the /callback request Supabase redirects to. An Axios call
 * running in the app's own network stack has a separate cookie jar from
 * the browser surface openAuthSessionAsync opens — the verifier would
 * never reach the browser, and exchangeCodeForSession() would fail.
 *
 * handoff_challenge = base64url(SHA256(handoffVerifier)) — the app
 * generates handoffVerifier and keeps it in memory only; only the hash
 * travels through this URL and gets stored (see below) for /oauth/callback
 * to persist on the ticket row, and /oauth/complete to verify against.
 * This binds the eventual ticket to the specific app instance that started
 * this flow — mobile://auth-callback isn't an OS-verified HTTPS App
 * Link/Universal Link, so intercepting that deep link must not be enough
 * on its own to redeem the ticket.
 *
 * Every failure path here redirects to the mobile:// scheme (never a bare
 * error page) so openAuthSessionAsync's return-url matching still fires
 * and hands control back to the app with a parseable ?error=.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const handoffChallenge = searchParams.get("handoff_challenge");

  if (!isSupportedOAuthProvider(provider)) {
    return NextResponse.redirect(`${MOBILE_ERROR_REDIRECT}?error=oauth_unsupported_provider`);
  }

  if (!isValidHandoffChallenge(handoffChallenge)) {
    // Not logged with its value — a malformed/missing challenge isn't
    // sensitive, but there's no reason to echo arbitrary caller input into
    // logs either.
    logger.warn("OAuth start: missing or malformed handoff_challenge", { provider });
    return NextResponse.redirect(`${MOBILE_ERROR_REDIRECT}?error=oauth_missing_challenge`);
  }

  try {
    const ip = getClientIp(request.headers);
    assertRateLimit(`oauth-start:${ip}`, 10, 60_000);
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      return NextResponse.redirect(`${MOBILE_ERROR_REDIRECT}?error=oauth_rate_limited`);
    }
    throw error;
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: OAUTH_CALLBACK_URL,
      },
    });

    if (error || !data.url) {
      logger.error("OAuth start failed", { provider, error: error?.message });
      return NextResponse.redirect(`${MOBILE_ERROR_REDIRECT}?error=oauth_start_failed`);
    }

    // Same cookie-writing mechanism the Supabase SSR client itself just
    // used above for its own PKCE-verifier cookie — this response carries
    // both, in the same browser session that will later hit /oauth/callback.
    (await cookies()).set(HANDOFF_CHALLENGE_COOKIE, handoffChallenge, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 5 * 60, // 5 minutes — generous for the provider consent screen, short otherwise
      path: "/",
    });

    // 302 to the provider's consent screen — the PKCE-verifier cookie
    // signInWithOAuth() just set is attached to this same response.
    return NextResponse.redirect(data.url);
  } catch (error) {
    logger.error("OAuth start threw unexpectedly", {
      provider,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.redirect(`${MOBILE_ERROR_REDIRECT}?error=oauth_start_failed`);
  }
}
