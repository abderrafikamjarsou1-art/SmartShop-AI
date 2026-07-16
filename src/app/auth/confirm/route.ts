import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Email link handler — covers BOTH:
 *  - signup verification  (type=signup / email)
 *  - password recovery    (type=recovery -> redirected to /reset-password)
 *
 * Supabase email templates must point to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      const destination = type === "recovery" ? "/reset-password" : safeNext;
      return NextResponse.redirect(`${origin}${destination}`);
    }
    logger.warn("Email OTP verification failed", { type, error: error.message });
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
