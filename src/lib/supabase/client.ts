import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (browser).
 * Used only for auth UI flows (OAuth redirect, password reset form).
 * All data access goes through Server Actions -> Prisma, never this client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
