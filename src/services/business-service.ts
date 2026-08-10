import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";
import type { CreateBusinessInput, UpdateBusinessInput } from "@/lib/validation/business";

/**
 * Business service — onboarding. There's no TenantContext yet at this
 * point (that's the whole problem: the user has no business), so these
 * take the raw authenticated Prisma User instead, exactly like
 * requireAuth() returns it. Never trust a userId from the client — the
 * caller (route/action) must have resolved `user` from the session.
 */
export const businessService = {
  /**
   * The user's first (or Nth, for web's "add another business" flow —
   * see /onboarding?new=1) business: create it, make the caller OWNER,
   * start a FREE subscription — one transaction, so a half-created
   * tenant can never exist. No "already has a business" guard here on
   * purpose: multi-business is a real, supported feature (the business
   * switcher's "New business" link reuses this exact path). Callers
   * that need first-time-only idempotency (mobile onboarding) check for
   * an existing membership themselves before calling this.
   */
  async create(user: User, input: CreateBusinessInput) {
    const business = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          taxRate: input.taxRate,
          logoUrl: input.logoUrl ?? null,
        },
      });
      await tx.userBusiness.create({
        data: { userId: user.id, businessId: business.id, role: "OWNER" },
      });
      await tx.subscription.create({
        data: { businessId: business.id, plan: "FREE", status: "ACTIVE" },
      });
      return business;
    });

    logger.info("Business created", { businessId: business.id, userId: user.id });
    return business;
  },

  /** The first membership a user has, if any — same resolution order as getCurrentBusiness()'s no-cookie fallback. */
  async findFirstMembership(userId: string) {
    return prisma.userBusiness.findFirst({
      where: { userId, business: { deletedAt: null } },
      include: { business: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Settings: edit an existing business's profile fields. Scoped by ctx.businessId — callers must already hold settings:manage (enforced at the route/action layer via requireRole). */
  async update(ctx: TenantContext, input: UpdateBusinessInput) {
    return prisma.$transaction(async (tx) => {
      const business = await tx.business.update({
        where: { id: ctx.businessId },
        data: {
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          taxRate: input.taxRate,
        },
      });
      await audit(tx, ctx, "business.update", "Business", business.id, {
        name: business.name, currency: business.currency, taxRate: business.taxRate.toString(),
      });
      return business;
    });
  },
};
