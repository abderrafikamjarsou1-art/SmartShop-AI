"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { requireSuperAdmin } from "@/lib/auth";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zUuid, zRequiredString } from "@/lib/validation";
import { billingService } from "@/services/billing-service";
import { adminService } from "@/services/admin-service";

/* =====================================================
   Billing actions — permission: billing:manage (OWNER only)
   ===================================================== */

const planSchema = z.object({
  plan: z.enum(["PRO", "BUSINESS"]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
});

export async function startCheckout(input: unknown): Promise<ActionResult<never>> {
  const result = await safeAction("billing.checkout", async () => {
    const ctx = await requireRole("billing:manage");
    const { plan, interval } = zParse(planSchema, input);
    return billingService.createCheckoutSession(ctx, plan, interval);
  });
  if (!result.success) return result;
  redirect(result.data.url); // -> Stripe Checkout
}

export async function openBillingPortal(): Promise<ActionResult<never>> {
  const result = await safeAction("billing.portal", async () => {
    const ctx = await requireRole("billing:manage");
    return billingService.createPortalSession(ctx);
  });
  if (!result.success) return result;
  redirect(result.data.url);
}

export async function changePlan(input: unknown): Promise<ActionResult<{ plan: string }>> {
  return safeAction("billing.changePlan", async () => {
    const ctx = await requireRole("billing:manage");
    const { plan, interval } = zParse(planSchema, input);
    const result = await billingService.changePlan(ctx, plan, interval);
    revalidatePath("/settings/billing");
    return { plan: result.plan };
  });
}

export async function cancelSubscription(): Promise<ActionResult<{ ok: true }>> {
  return safeAction("billing.cancel", async () => {
    const ctx = await requireRole("billing:manage");
    await billingService.cancel(ctx);
    revalidatePath("/settings/billing");
    return { ok: true as const };
  });
}

export async function resumeSubscription(): Promise<ActionResult<{ ok: true }>> {
  return safeAction("billing.resume", async () => {
    const ctx = await requireRole("billing:manage");
    await billingService.resume(ctx);
    revalidatePath("/settings/billing");
    return { ok: true as const };
  });
}

/* =====================================================
   Admin actions — requireSuperAdmin on EVERY one
   ===================================================== */

export async function adminSuspendBusiness(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return safeAction("admin.suspend", async () => {
    const admin = await requireSuperAdmin();
    const { businessId, reason } = zParse(
      z.object({ businessId: zUuid, reason: zRequiredString("Reason", 200) }), input);
    await adminService.suspendBusiness(admin.id, businessId, reason);
    revalidatePath("/admin");
    return { ok: true as const };
  });
}

export async function adminReactivateBusiness(businessId: string): Promise<ActionResult<{ ok: true }>> {
  return safeAction("admin.reactivate", async () => {
    const admin = await requireSuperAdmin();
    await adminService.reactivateBusiness(admin.id, zParse(zUuid, businessId));
    revalidatePath("/admin");
    return { ok: true as const };
  });
}

export async function adminSetPlan(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return safeAction("admin.setPlan", async () => {
    const admin = await requireSuperAdmin();
    const { businessId, plan } = zParse(
      z.object({ businessId: zUuid, plan: z.enum(["FREE", "PRO", "BUSINESS"]) }), input);
    await adminService.setPlan(admin.id, businessId, plan);
    revalidatePath("/admin");
    return { ok: true as const };
  });
}

export async function adminImpersonate(businessId: string): Promise<ActionResult<never>> {
  const result = await safeAction("admin.impersonate", async () => {
    const admin = await requireSuperAdmin();
    await adminService.startImpersonation(admin.id, zParse(zUuid, businessId));
    return {};
  });
  if (!result.success) return result;
  redirect("/dashboard"); // now viewing as the business, read-only
}

export async function adminStopImpersonation(): Promise<ActionResult<never>> {
  const result = await safeAction("admin.stopImpersonation", async () => {
    const admin = await requireSuperAdmin();
    await adminService.stopImpersonation(admin.id);
    return {};
  });
  if (!result.success) return result;
  redirect("/admin");
}

export async function adminBroadcast(input: unknown): Promise<ActionResult<{ count: number }>> {
  return safeAction("admin.broadcast", async () => {
    const admin = await requireSuperAdmin();
    const { title, message } = zParse(
      z.object({ title: zRequiredString("Title", 100), message: zRequiredString("Message", 500) }), input);
    return adminService.broadcastNotification(admin.id, title, message);
  });
}
