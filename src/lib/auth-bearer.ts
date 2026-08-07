import "server-only";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Mobile (Expo) bearer-token verification.
 *
 * The web app authenticates via a Supabase session cookie (see
 * lib/supabase/server.ts + lib/auth.ts). The mobile app has no cookies, so
 * it sends `Authorization: Bearer <supabase_access_token>` instead — the
 * same access token Supabase returned at login/register.
 *
 * This module is intentionally separate from lib/auth.ts's cookie client:
 * it never reads or writes cookies, so it's safe to call from any request
 * context without side effects on the web session.
 */

let bearerClient: ReturnType<typeof createSupabaseJsClient> | null = null;

/** Lazily builds a stateless Supabase client (anon key, no session persistence). */
function getBearerClient() {
  if (bearerClient) return bearerClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  bearerClient = createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return bearerClient;
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Verifies a Supabase access token and returns the matching Prisma User,
 * syncing it just-in-time (same behavior as the cookie-based flow in
 * lib/auth.ts, so both entry points always converge on the same row).
 *
 * Returns null for any failure (missing config, expired/invalid token) —
 * callers treat that identically to "no session" for a guest/cookie user.
 */
export async function getUserFromBearerToken(token: string): Promise<User | null> {
  const client = getBearerClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const authUser = data.user;
  if (!authUser.email) return null;

  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    update: {
      email: authUser.email,
      fullName: authUser.user_metadata?.full_name ?? undefined,
      avatarUrl: authUser.user_metadata?.avatar_url ?? undefined,
    },
    create: {
      id: authUser.id,
      email: authUser.email,
      fullName: authUser.user_metadata?.full_name ?? null,
      avatarUrl: authUser.user_metadata?.avatar_url ?? null,
    },
  });

  return user;
}
