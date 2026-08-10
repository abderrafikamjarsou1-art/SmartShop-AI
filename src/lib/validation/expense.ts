import { z } from "zod";
import { zUuid, zMoney, zRequiredString, zOptionalString, zPagination } from "@/lib/validation";

// =====================================================
// Expenses
// =====================================================

const attachmentSchema = z.object({
  url: z.string().url(),
  path: z.string().min(1),
  name: z.string().max(200),
  mimeType: z.string().max(100),
});

export const expenseSchema = z.object({
  title: zRequiredString("Title", 200),
  category: z.enum(["RENT", "UTILITIES", "SALARIES", "MARKETING", "SUPPLIES", "TRANSPORT", "MAINTENANCE", "TAXES", "INSURANCE", "OTHER"]),
  amount: zMoney.refine((v) => v > 0, "Amount must be positive."),
  taxAmount: zMoney.default(0),
  date: z.coerce.date(),
  supplierId: zUuid.optional().or(z.literal("").transform(() => undefined)), // vendor
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER"]).optional(),
  notes: zOptionalString(500),
  attachments: z.array(attachmentSchema).max(5).default([]),
  isRecurring: z.coerce.boolean().default(false),
  recurrenceInterval: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
}).refine((d) => !d.isRecurring || !!d.recurrenceInterval, {
  message: "Choose how often this expense repeats.",
  path: ["recurrenceInterval"],
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const updateExpenseSchema = z.object({ id: zUuid }).and(expenseSchema);

export const expenseFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),
  category: z.enum(["RENT", "UTILITIES", "SALARIES", "MARKETING", "SUPPLIES", "TRANSPORT", "MAINTENANCE", "TAXES", "INSURANCE", "OTHER"]).optional(),
  supplierId: zUuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  deleted: z.coerce.boolean().default(false),
  recurring: z.coerce.boolean().default(false), // show templates view
});
export type ExpenseFilter = z.infer<typeof expenseFilterSchema>;

// =====================================================
// Reports
// =====================================================

export const reportPeriodSchema = z.object({
  preset: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]).default("monthly"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((d) => d.preset !== "custom" || (d.from && d.to), {
  message: "Custom range needs both dates.", path: ["from"],
});
export type ReportPeriodInput = z.infer<typeof reportPeriodSchema>;

/** Optional slicers applied to sales-derived reports. */
export const reportFilterSchema = reportPeriodSchema.and(z.object({
  employeeId: zUuid.optional(),
  customerId: zUuid.optional(),
  supplierId: zUuid.optional(),
  categoryId: zUuid.optional(),
  productId: zUuid.optional(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "STORE_CREDIT"]).optional(),
  tab: z.enum(["executive", "sales", "inventory", "financial"]).default("executive"),
}));
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const reportExportSchema = z.object({
  report: z.enum(["financial-summary", "top-products", "top-customers", "sales-by-employee", "payment-methods", "refunds", "purchases", "expenses", "low-stock", "inventory-valuation"]),
  format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
  preset: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]).default("monthly"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
