import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { round2 } from "@/lib/sale-math";

/**
 * Admin service — PLATFORM level, deliberately outside TenantContext.
 * Callers must be gated by requireSuperAdmin() (done in actions/pages).
 *
 * IMPERSONATION DESIGN (read-only):
 * starting impersonation sets an httpOnly cookie with the target
 * businessId. tenant.ts (see PATCH-tenant.md) resolves it for super
 * admins into a TenantContext with role EMPLOYEE — the lowest, read-only
 * role — so every existing permission check automatically prevents
 * writes. No parallel "admin mode" code paths to audit.
 */

export const IMPERSONATE_COOKIE = "ssai-impersonate";

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

export const adminService = {
  // ---------------------------------------------------------------
  // PLATFORM KPIs
  // ---------------------------------------------------------------
  async getPlatformKpis() {
    const [subs, businesses, users, signups, churned, aiMessages, trialing] = await Promise.all([
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        select: { plan: true, interval: true, status: true },
      }),
      prisma.business.count({ where: { deletedAt: null, suspendedAt: null } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: daysAgo(30) } } }),
      prisma.subscription.count({ where: { status: "CANCELED", updatedAt: { gte: daysAgo(30) } } }),
      prisma.aiMessage.count({ where: { role: "USER", createdAt: { gte: monthStart() } } }),
      prisma.subscription.count({ where: { status: "TRIALING" } }),
    ]);

    // MRR: paying subs normalized to monthly (yearly / 12); trials excluded
    const mrr = subs
      .filter((s) => s.status !== "TRIALING" && s.plan !== "FREE")
      .reduce((sum, s) => {
        const def = PLANS[s.plan as PlanId];
        return sum + (s.interval === "YEARLY" ? def.yearlyPrice / 12 : def.monthlyPrice);
      }, 0);

    const paying = subs.filter((s) => s.status !== "TRIALING" && s.plan !== "FREE").length;
    // Churn: canceled in the last 30d over the cohort (paying now + those who left)
    const churnRate = paying + churned > 0 ? round2((churned / (paying + churned)) * 100) : 0;

    return {
      mrr: round2(mrr),
      arr: round2(mrr * 12),
      activeBusinesses: businesses,
      activeUsers: users,
      payingSubscriptions: paying,
      trialUsers: trialing,
      churnRate,
      newSignups30d: signups,
      aiRequestsThisMonth: aiMessages,
      byPlan: (["FREE", "PRO", "BUSINESS"] as const).map((p) => ({
        plan: p,
        count: subs.filter((s) => s.plan === p).length,
      })),
    };
  },

  // ---------------------------------------------------------------
  // BUSINESS / USER MANAGEMENT
  // ---------------------------------------------------------------
  async listBusinesses(q?: string, page = 1, perPage = 20) {
    const where = {
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.business.findMany({
        where,
        include: {
          subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
          _count: { select: { members: true, products: true, sales: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage, take: perPage,
      }),
      prisma.business.count({ where }),
    ]);
    return { items, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  },

  async listUsers(q?: string, page = 1, perPage = 20) {
    const where = q
      ? { OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { fullName: { contains: q, mode: "insensitive" as const } },
        ] }
      : {};
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        include: { memberships: { include: { business: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage, take: perPage,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  },

  async suspendBusiness(adminUserId: string, businessId: string, reason: string) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundError("Business");
    await prisma.$transaction([
      prisma.business.update({ where: { id: businessId }, data: { suspendedAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          businessId, userId: adminUserId,
          action: "admin.business.suspend", entity: "Business", entityId: businessId,
          metadata: { reason },
        },
      }),
      prisma.notification.create({
        data: {
          businessId, userId: null, type: "SYSTEM",
          title: "Account suspended",
          message: "This business has been suspended by the platform. Contact support.",
        },
      }),
    ]);
  },

  async reactivateBusiness(adminUserId: string, businessId: string) {
    await prisma.$transaction([
      prisma.business.update({ where: { id: businessId }, data: { suspendedAt: null } }),
      prisma.auditLog.create({
        data: {
          businessId, userId: adminUserId,
          action: "admin.business.reactivate", entity: "Business", entityId: businessId,
        },
      }),
    ]);
  },

  /** Force a plan locally (support tool). Stripe stays authoritative for paid flows. */
  async setPlan(adminUserId: string, businessId: string, plan: PlanId) {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { businessId },
        data: { plan, status: "ACTIVE" },
      }),
      prisma.auditLog.create({
        data: {
          businessId, userId: adminUserId,
          action: "admin.plan.set", entity: "Subscription", entityId: businessId,
          metadata: { plan },
        },
      }),
    ]);
  },

  // ---------------------------------------------------------------
  // IMPERSONATION (read-only) — see tenant.ts patch
  // ---------------------------------------------------------------
  async startImpersonation(adminUserId: string, businessId: string) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundError("Business");
    const store = await cookies();
    store.set(IMPERSONATE_COOKIE, businessId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60, // 1 hour max
    });
    await prisma.auditLog.create({
      data: {
        businessId, userId: adminUserId,
        action: "admin.impersonate.start", entity: "Business", entityId: businessId,
      },
    });
  },

  async stopImpersonation(adminUserId: string) {
    const store = await cookies();
    const businessId = store.get(IMPERSONATE_COOKIE)?.value;
    store.delete(IMPERSONATE_COOKIE);
    if (businessId) {
      await prisma.auditLog.create({
        data: {
          businessId, userId: adminUserId,
          action: "admin.impersonate.stop", entity: "Business", entityId: businessId,
        },
      });
    }
  },

  /** Recent platform-wide audit trail (billing + admin actions). */
  async recentAuditLogs(take = 50) {
    return prisma.auditLog.findMany({
      where: { action: { startsWith: "admin." } },
      include: { user: { select: { email: true } }, business: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take,
    });
  },

  /** Broadcast a platform notification to every active business. */
  async broadcastNotification(adminUserId: string, title: string, message: string) {
    const businesses = await prisma.business.findMany({
      where: { deletedAt: null, suspendedAt: null }, select: { id: true },
    });
    await prisma.$transaction([
      prisma.notification.createMany({
        data: businesses.map((b) => ({
          businessId: b.id, userId: null, type: "SYSTEM" as const, title, message,
        })),
      }),
      prisma.auditLog.create({
        data: {
          businessId: businesses[0]?.id ?? adminUserId, userId: adminUserId,
          action: "admin.broadcast", entity: "Notification", entityId: null,
          metadata: { title, count: businesses.length },
        },
      }),
    ]);
    return { count: businesses.length };
  },
};
