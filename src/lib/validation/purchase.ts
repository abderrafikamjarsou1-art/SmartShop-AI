import { z } from "zod";
import { zUuid, zMoney, zRequiredString, zPagination } from "@/lib/validation";

/** Purchases & receiving schemas. */

export const purchaseItemSchema = z.object({
  productId: zUuid,
  quantity: z.coerce.number().int().positive("Quantity must be at least 1."),
  unitCost: zMoney, // negotiated cost for THIS order — the historical record
});

export const createPurchaseSchema = z.object({
  supplierId: zUuid,
  status: z.enum(["DRAFT", "ORDERED"]).default("DRAFT"),
  items: z.array(purchaseItemSchema).min(1, "Add at least one line.").max(200),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const updateDraftPurchaseSchema = createPurchaseSchema.omit({ status: true }).extend({ id: zUuid });
export type UpdateDraftPurchaseInput = z.infer<typeof updateDraftPurchaseSchema>;

/** Receiving — idempotent via clientRef. */
export const receivePurchaseSchema = z.object({
  purchaseId: zUuid,
  clientRef: zUuid,
  items: z
    .array(z.object({ purchaseItemId: zUuid, quantity: z.coerce.number().int().positive() }))
    .min(1, "Nothing to receive.")
    .max(200),
  /** Optional: copy this receipt's unit costs onto Product.buyingPrice */
  updateProductCost: z.coerce.boolean().default(false),
  notes: z.string().trim().max(300).optional(),
});
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

/** Return received units to the supplier. */
export const purchaseReturnSchema = z.object({
  purchaseId: zUuid,
  items: z
    .array(z.object({ purchaseItemId: zUuid, quantity: z.coerce.number().int().positive() }))
    .min(1, "Select at least one item.")
    .max(200),
  reason: zRequiredString("Reason", 200),
});
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;

export const purchaseFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),   // PO number / supplier
  status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
  supplierId: zUuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type PurchaseFilter = z.infer<typeof purchaseFilterSchema>;

/** CSV row for building a draft PO. Header: sku,quantity,unitCost */
export const purchaseCsvRowSchema = z.object({
  sku: zRequiredString("SKU", 64),
  quantity: z.coerce.number().int().positive(),
  unitCost: zMoney,
});
export type PurchaseCsvRow = z.infer<typeof purchaseCsvRowSchema>;
