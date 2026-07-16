"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { setActiveBusiness } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zRequiredString, zOptionalString } from "@/lib/validation";
import { logger } from "@/lib/logger";

const createBusinessSchema = z.object({
  name: zRequiredString("Business name", 100),
  currency: z.string().length(3, "Use a 3-letter currency code."),
  timezone: zRequiredString("Timezone", 64),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  logoUrl: zOptionalString(500),
});

/**
 * Onboarding: creates the business, makes the user OWNER, starts a FREE
 * subscription — one transaction, so a half-created tenant can't exist.
 */
export async function createBusiness(input: unknown): Promise<ActionResult<{ businessId: string }>> {
  return safeAction("business.create", async () => {
    const user = await requireAuth();
    const data = zParse(createBusinessSchema, input);

    const business = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: data.name,
          currency: data.currency,
          timezone: data.timezone,
          taxRate: data.taxRate,
          logoUrl: data.logoUrl ?? null,
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

    await setActiveBusiness(user.id, business.id);
    logger.info("Business created", { businessId: business.id, userId: user.id });
    return { businessId: business.id };
  });
}

/** Business switcher: validate membership, set cookie, refresh everything. */
export async function switchBusiness(businessId: string): Promise<void> {
  const user = await requireAuth();
  await setActiveBusiness(user.id, businessId); // throws ForbiddenError if not a member
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
