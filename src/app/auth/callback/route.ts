import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * OAuth callback (Google).
 * Google redirects here with ?code=... ; we exchange it for a session,
 * then send the user into the app. User row sync happens lazily in
 * getCurrentUser() (lib/auth.ts), so OAuth-first users are covered.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    logger.error("OAuth code exchange failed", { error });
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
