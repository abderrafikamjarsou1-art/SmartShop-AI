import "server-only";
import type { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/tenant";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Flat auth context for API Route Handlers (used by /api/auth/me and any
 * mobile-facing route that just needs "who is this" without the full
 * TenantContext shape from lib/tenant.ts).
 *
 * role/businessId are null when the user has no business yet (onboarding) —
 * that is a valid state, not a failure, so this does NOT throw for it.
 */
export interface ApiAuthContext {
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  role: UserRole | null;
  businessId: string | null;
}

/**
 * Resolves the current user for either transport — mobile Bearer token or
 * web session cookie — via getCurrentUser() (see lib/auth.ts), which already
 * checks the Authorization header first and falls back to cookies.
 *
 * Throws UnauthorizedError (401) when there is no valid session at all.
 * Existing route handlers already catch ApiError subclasses via
 * isApiError() and convert them to a uniform JSON 401 — this reuses that
 * same convention instead of introducing a second error-response shape.
 */
export async function requireApiAuth(): Promise<ApiAuthContext> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();

  // Reuses the same cached call chain as getCurrentUser() above — no extra
  // Supabase/DB round trip when a business exists.
  const tenant = await getCurrentBusiness();

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    isSuperAdmin: user.isSuperAdmin,
    role: tenant?.role ?? null,
    businessId: tenant?.businessId ?? null,
  };
}
