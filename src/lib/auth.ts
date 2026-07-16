import "server-only";
import { cache } from "react";
import type { User } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Auth layer — the ONLY place that talks to Supabase Auth on the server.
 * Everything downstream (tenant.ts, services) works with our Prisma User.
 *
 * React cache() memoizes per-request: calling requireAuth() in a layout,
 * a page and three actions costs ONE Supabase verification per request.
 */

/** Returns the app User (Prisma) for the current session, or null for guests. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();

  // getUser() validates the JWT server-side — never trust getSession() alone.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // Just-in-time sync: guarantees a Prisma row exists for every Supabase
  // identity (covers OAuth signups where no register form ran).
  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    update: {
      email: authUser.email!,
      fullName: authUser.user_metadata?.full_name ?? undefined,
      avatarUrl: authUser.user_metadata?.avatar_url ?? undefined,
    },
    create: {
      id: authUser.id,
      email: authUser.email!,
      fullName: authUser.user_metadata?.full_name ?? null,
      avatarUrl: authUser.user_metadata?.avatar_url ?? null,
    },
  });

  return user;
});

/** Throws UnauthorizedError if there is no valid session. */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Requires a platform super admin (admin dashboard). */
export async function requireSuperAdmin(): Promise<User> {
  const user = await requireAuth();
  if (!user.isSuperAdmin) throw new UnauthorizedError("Admin access required.");
  return user;
}
