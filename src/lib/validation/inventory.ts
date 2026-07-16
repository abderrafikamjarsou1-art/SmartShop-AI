import { z } from "zod";
import { zUuid, zNonNegativeInt, zPagination, zOptionalString } from "@/lib/validation";

/**
 * Inventory schemas — ledger filters, bulk adjustments and CSV import.
 */

// ---------- Movements ledger query (from URL searchParams) ----------
export const movementFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),          // product name / sku / reason
  productId: zUuid.optional(),
  supplierId: zUuid.optional(),                       // via the product's supplier
  userId: zUuid.optional(),
  type: z.enum(["PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "INITIAL"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),   // ledger sorts by time only
});
export type MovementFilter = z.infer<typeof movementFilterSchema>;

// ---------- Bulk adjustment / CSV import ----------
/** One CSV row. Header: sku,newQuantity,reason */
export const importRowSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required."),
  newQuantity: zNonNegativeInt,
  reason: zOptionalString(200).default("Bulk adjustment"),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const bulkAdjustSchema = z.object({
  rows: z.array(importRowSchema).min(1, "No rows to import.").max(500, "Maximum 500 rows per import."),
  /** true = all-or-nothing transaction; false = apply valid rows, report the rest */
  atomic: z.boolean().default(false),
});
export type BulkAdjustInput = z.infer<typeof bulkAdjustSchema>;

/** Result shape shared by service, action and the import dialog UI */
export interface BulkAdjustResult {
  applied: number;
  skipped: { row: number; sku: string; error: string }[];
}

// ---------- Export ----------
export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  type: z.enum(["stock", "movements"]).default("stock"),
});
