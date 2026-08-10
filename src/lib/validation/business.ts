import { z } from "zod";
import { zRequiredString, zOptionalString } from "@/lib/validation";

/**
 * Shared by the web onboarding wizard (src/actions/business.ts) and the
 * mobile onboarding route (src/app/api/business/onboarding/route.ts) —
 * one schema, one set of fields a business can actually be created with.
 */
export const createBusinessSchema = z.object({
  name: zRequiredString("Business name", 100),
  currency: z.string().length(3, "Use a 3-letter currency code."),
  timezone: zRequiredString("Timezone", 64),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  logoUrl: zOptionalString(500),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

/** Editing an existing business (Settings) — same field rules as creation, minus logoUrl (no upload flow yet). */
export const updateBusinessSchema = z.object({
  name: zRequiredString("Business name", 100),
  currency: z.string().length(3, "Use a 3-letter currency code."),
  timezone: zRequiredString("Timezone", 64),
  taxRate: z.coerce.number().min(0).max(100),
});
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
