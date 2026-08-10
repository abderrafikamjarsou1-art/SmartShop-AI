"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import {
  zParseFormData,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

/** Resolves the caller's IP for rate-limit keys from the current request headers. */
async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

/**
 * Auth Server Actions.
 * Note: Supabase intentionally returns vague errors for login failures
 * ("Invalid login credentials") — we pass those through as-is to avoid
 * user enumeration (never reveal whether an email exists).
 */

// ---------- Login (email/password) ----------
export async function login(_prev: unknown, formData: FormData): Promise<ActionResult<never>> {
  const result = await safeAction("auth.login", async () => {
    const ip = await clientIp();
    const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    assertRateLimit(`login:${ip}:${rawEmail}`, 10, 60_000);

    const { email, password } = zParseFormData(loginSchema, formData);
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ValidationError(error.message);
  });

  if (!result.success) return result;

  const next = (formData.get("next") as string) || "/dashboard";
  // Prevent open redirects: only allow internal paths
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

// ---------- Register ----------
export async function register(_prev: unknown, formData: FormData): Promise<ActionResult<{ needsVerification: boolean }>> {
  return safeAction("auth.register", async () => {
    const ip = await clientIp();
    assertRateLimit(`register:${ip}`, 5, 15 * 60_000);

    const { fullName, email, password } = zParseFormData(registerSchema, formData);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Email verification link lands here, then we exchange the token
        emailRedirectTo: `${APP_URL}/auth/confirm`,
      },
    });

    if (error) throw new ValidationError(error.message);

    logger.info("User registered", { email });
    // Supabase sends the verification email automatically.
    return { needsVerification: !data.session };
  });
}

// ---------- Google OAuth ----------
export async function loginWithGoogle(): Promise<never | ActionResult<never>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${APP_URL}/auth/callback`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) {
    logger.error("Google OAuth init failed", { error });
    return { success: false, error: "Could not start Google sign-in.", code: "OAUTH_ERROR" };
  }

  redirect(data.url); // -> Google consent screen -> /auth/callback
}

// ---------- Forgot password ----------
export async function forgotPassword(_prev: unknown, formData: FormData): Promise<ActionResult<{ sent: true }>> {
  return safeAction("auth.forgotPassword", async () => {
    const ip = await clientIp();
    const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    assertRateLimit(`forgot-password:${ip}:${rawEmail}`, 5, 60_000);

    const { email } = zParseFormData(forgotPasswordSchema, formData);
    const supabase = await createClient();

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/auth/confirm?next=/reset-password`,
    });

    // Always report success — never reveal whether the email exists.
    return { sent: true as const };
  });
}

// ---------- Reset password (user arrives via email link, session already set) ----------
export async function resetPassword(_prev: unknown, formData: FormData): Promise<ActionResult<never>> {
  const result = await safeAction("auth.resetPassword", async () => {
    const ip = await clientIp();
    assertRateLimit(`reset-password:${ip}`, 10, 60_000);

    const { password } = zParseFormData(resetPasswordSchema, formData);
    const supabase = await createClient();

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ValidationError(error.message);
  });

  if (!result.success) return result;
  redirect("/login?reset=success");
}

// ---------- Logout ----------
export async function logout(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
export async function testAction() {
  "use server";

  console.log("SERVER ACTION WORKS");
  return { success: true };
}
