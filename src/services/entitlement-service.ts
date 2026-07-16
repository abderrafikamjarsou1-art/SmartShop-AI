import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import { PLANS, type Feature, type PlanId, type QuotaMetric } from "@/lib/billing/plans";
import type { TenantContext } from "@/lib/tenant";

/**
 * Entitlement service — THE plan-enforcement layer.
 *
 * DESIGN DECISIONS:
 *  1. Enforcement lives HERE and is called from SERVICES only. The UI may
 *     read entitlements to gray out buttons (nice UX), but the security
 *     boundary is the service call — a crafted request can't bypass a
 *     hidden button.
 *  2. Countable quotas (products, customers, sales/month...) are COUNTED
 *     from their own tables at check time — a count can never drift from
 *     reality the way a maintained counter can. These are cheap indexed
 *     COUNT(*) queries. Only metrics with no table (storage bytes, API
 *     calls) use UsageCounter rows.
 *  3. Rejections are graceful: QuotaExceededError / FeatureLockedError
 *     are ApiErrors with expose=true and a clear upgrade message — the
 *     standard safeAction pipeline turns them into friendly UI errors.
 */

export class FeatureLockedError extends ApiError {
  constructor(feature: Feature, plan: PlanId) {
    super(
      `This feature isn't included in the ${PLANS[plan].name} plan. Upgrade in Settings → Billing to unlock it.`,
      403, "FEATURE_LOCKED", true
    );
    this.feature = feature;
  }
  feature: Feature;
}

export class QuotaExceededError extends ApiError {
  constructor(metric: QuotaMetric, limit: number, plan: PlanId) {
    super(
      `You've reached the ${PLANS[plan].name} plan limit (${limitLabel(metric, limit)}). Upgrade in Settings → Billing for more.`,
      403, "QUOTA_EXCEEDED", true
    );
  }
}

export class BusinessSuspendedError extends ApiError {
  constructor() {
    super("This business is suspended. Contact support.", 403, "SUSPENDED", true);
  }
}

function limitLabel(metric: QuotaMetric, limit: number) {
  const labels: Record<QuotaMetric, string> = {
    products: `${limit} products`, customers: `${limit} customers`, suppliers: `${limit} suppliers`,
    salesPerMonth: `${limit} sales/month`, invoicesPerMonth: `${limit} invoices/month`,
    aiRequestsPerMonth: `${limit} AI requests/month`,
    storageBytes: `${Math.round(limit / 1024 ** 3)} GB storage`, apiCallsPerMonth: `${limit} API calls/month`,
  };
  return labels[metric];
}

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

export const entitlementService = {
  /** Effective plan for a business: paying/trialing plan, else FREE. */
  async getPlan(ctx: TenantContext): Promise<PlanId> {
    const sub = await prisma.subscription.findUnique({
      where: { businessId: ctx.businessId },
      select: { plan: true, status: true },
    });
    if (!sub) return "FREE";
    // PAST_DUE keeps access while Stripe retries; CANCELED/INCOMPLETE fall to FREE
    return ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status) ? (sub.plan as PlanId) : "FREE";
  },

  async assertNotSuspended(ctx: TenantContext) {
    if ((ctx.business as { suspendedAt?: Date | null }).suspendedAt) throw new BusinessSuspendedError();
  },

  // ---------------------------------------------------------------
  // requireFeature — boolean gate
  // ---------------------------------------------------------------
  async requireFeature(ctx: TenantContext, feature: Feature): Promise<void> {
    await this.assertNotSuspended(ctx);
    const plan = await this.getPlan(ctx);
    if (!PLANS[plan].features.has(feature)) throw new FeatureLockedError(feature, plan);
  },

  async hasFeature(ctx: TenantContext, feature: Feature): Promise<boolean> {
    const plan = await this.getPlan(ctx);
    return PLANS[plan].features.has(feature);
  },

  // ---------------------------------------------------------------
  // requireQuota — counted gate. Call BEFORE creating `increment` more.
  // ---------------------------------------------------------------
  async requireQuota(ctx: TenantContext, metric: QuotaMetric, increment = 1): Promise<void> {
    await this.assertNotSuspended(ctx);
    const plan = await this.getPlan(ctx);
    const limit = PLANS[plan].quotas[metric];
    if (limit === Infinity) return;

    const current = await this.currentUsage(ctx, metric);
    if (current + increment > limit) throw new QuotaExceededError(metric, limit, plan);
  },

  /** Current usage per metric — counted from source tables where possible. */
  async currentUsage(ctx: TenantContext, metric: QuotaMetric): Promise<number> {
    const bid = ctx.businessId;
    switch (metric) {
      case "products":
        return prisma.product.count({ where: { businessId: bid, deletedAt: null } });
      case "customers":
        return prisma.customer.count({ where: { businessId: bid, deletedAt: null } });
      case "suppliers":
        return prisma.supplier.count({ where: { businessId: bid, deletedAt: null } });
      case "salesPerMonth":
        return prisma.sale.count({
          where: { businessId: bid, createdAt: { gte: monthStart() }, status: { not: "CANCELLED" } },
        });
      case "invoicesPerMonth":
        return prisma.invoice.count({ where: { businessId: bid, createdAt: { gte: monthStart() } } });
      case "aiRequestsPerMonth":
        return prisma.aiMessage.count({
          where: { role: "USER", createdAt: { gte: monthStart() }, conversation: { businessId: bid } },
        });
      case "storageBytes":
      case "apiCallsPerMonth": {
        const row = await prisma.usageCounter.findUnique({
          where: {
            businessId_metric_period: {
              businessId: bid,
              metric: metric === "storageBytes" ? "storageBytes" : "apiCalls",
              period: metric === "storageBytes" ? "all" : monthKey(),
            },
          },
        });
        return Number(row?.value ?? 0);
      }
    }
  },

  /** Increment a counter metric (storage on upload, apiCalls in API routes). */
  async trackCounter(ctx: TenantContext, metric: "storageBytes" | "apiCalls", delta: number) {
    const period = metric === "storageBytes" ? "all" : monthKey();
    await prisma.usageCounter.upsert({
      where: { businessId_metric_period: { businessId: ctx.businessId, metric, period } },
      create: { businessId: ctx.businessId, metric, period, value: BigInt(Math.max(0, delta)) },
      update: { value: { increment: BigInt(delta) } },
    });
  },

  /** Everything the billing page needs to render usage bars. */
  async getEntitlements(ctx: TenantContext) {
    const plan = await this.getPlan(ctx);
    const def = PLANS[plan];
    const metrics: QuotaMetric[] = [
      "products", "customers", "suppliers", "salesPerMonth",
      "invoicesPerMonth", "aiRequestsPerMonth", "storageBytes",
    ];
    const usage = Object.fromEntries(
      await Promise.all(metrics.map(async (m) => [m, {
        used: await this.currentUsage(ctx, m),
        limit: def.quotas[m] === Infinity ? null : def.quotas[m],
      }]))
    ) as Record<QuotaMetric, { used: number; limit: number | null }>;
    return { plan, features: [...def.features], usage };
  },
};
