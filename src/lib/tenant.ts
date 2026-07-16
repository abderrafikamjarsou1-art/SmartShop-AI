import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Business, User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * Tenant isolation layer — THE security boundary of the app.
 *
 * RULES (non-negotiable):
 *  1. No service or action touches Prisma without a TenantContext.
 *  2. Every query is scoped with ctx.businessId in the WHERE clause.
 *  3. Membership is verified against the DB on every request — a stolen
 *     or stale cookie can never grant access to another tenant.
 */

const ACTIVE_BUSINESS_COOKIE = "ssai-active-business";

export interface TenantContext {
  user: User;
  business: Business;
  role: UserRole;
  businessId: string;
}

/**
 * Resolves the active business for the current user.
 * Priority: cookie selection (multi-shop users) -> first membership.
 * Returns null if the user has no business yet (-> onboarding).
 */
export const getCurrentBusiness = cache(async (): Promise<TenantContext | null> => {
  const user = await requireAuth();
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;

  // Membership check and business fetch in one query.
  // CRITICAL: we look up by (userId + businessId), never businessId alone.
  const membership = selectedId
    ? await prisma.userBusiness.findUnique({
        where: { userId_businessId: { userId: user.id, businessId: selectedId } },
        include: { business: true },
      })
    : null;

  // Cookie missing/stale/malicious -> fall back to first membership
  const resolved =
    membership ??
    (await prisma.userBusiness.findFirst({
      where: { userId: user.id, business: { deletedAt: null } },
      include: { business: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!resolved || resolved.business.deletedAt) return null;

  return {
    user,
    business: resolved.business,
    role: resolved.role,
    businessId: resolved.businessId,
  };
});

/** Throws if the user has no business — actions can rely on a non-null tenant. */
export async function requireBusiness(): Promise<TenantContext> {
  const ctx = await getCurrentBusiness();
  if (!ctx) throw new NotFoundError("Business");
  return ctx;
}

/**
 * requireBusiness + permission check in one call.
 * This is the standard entry point for Server Actions:
 *
 *   export async function createProduct(input: unknown) {
 *     const ctx = await requireRole("products:manage");
 *     const data = zParse(productSchema, input);
 *     return productService.create(ctx, data); // service scopes by ctx.businessId
 *   }
 */
export async function requireRole(permission: Permission): Promise<TenantContext> {
  const ctx = await requireBusiness();
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError();
  }
  return ctx;
}

/** Switch active business (multi-shop users). Validates membership first. */
export async function setActiveBusiness(userId: string, businessId: string) {
  const membership = await prisma.userBusiness.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
  if (!membership) throw new ForbiddenError("You are not a member of this business.");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
