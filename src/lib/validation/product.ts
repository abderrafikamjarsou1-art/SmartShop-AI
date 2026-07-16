import { z } from "zod";
import { zUuid, zMoney, zNonNegativeInt, zRequiredString, zOptionalString, zPagination } from "@/lib/validation";

/**
 * Product schemas — single source of truth for the drawer form (client)
 * AND the server action (server). Business rules that pure Zod can
 * express live here; rules needing the DB (SKU uniqueness) live in the service.
 */

const productBase = z.object({
  name: zRequiredString("Product name", 200),
  sku: zOptionalString(64),
  barcode: zOptionalString(64),
  categoryId: zUuid.optional().or(z.literal("").transform(() => undefined)),
  supplierId: zUuid.optional().or(z.literal("").transform(() => undefined)),
  buyingPrice: zMoney,
  sellingPrice: zMoney,
  quantity: zNonNegativeInt,        // RULE: quantity cannot be negative
  minimumStock: zNonNegativeInt,    // RULE: minimum stock cannot be negative
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
  /** RULE: selling below cost must be an explicit decision */
  allowLoss: z.coerce.boolean().default(false),
  images: z
    .array(z.object({ url: z.string().url(), path: z.string().min(1) }))
    .max(5, "Maximum 5 images per product.")
    .default([]),
});

/** RULE: buyingPrice cannot exceed sellingPrice unless allowLoss */
const enforceMargin = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (d: z.infer<typeof productBase>) =>
      d.allowLoss || d.buyingPrice <= d.sellingPrice,
    {
      message: "Selling price is below cost. Enable “allow selling at a loss” to save anyway.",
      path: ["sellingPrice"],
    }
  );

export const createProductSchema = enforceMargin(productBase);
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = enforceMargin(
  productBase.extend({ id: zUuid })
);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Manual stock adjustment (creates an ADJUSTMENT movement) */
export const adjustStockSchema = z.object({
  id: zUuid,
  newQuantity: zNonNegativeInt,
  reason: zRequiredString("Reason", 200),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

/** List query — parsed straight from URL searchParams */
export const productFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: zUuid.optional(),
  supplierId: zUuid.optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  stock: z.enum(["all", "in", "low", "out"]).default("all"),
  deleted: z.coerce.boolean().default(false), // trash view
  sortBy: z.enum(["name", "sellingPrice", "buyingPrice", "quantity", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ProductFilter = z.infer<typeof productFilterSchema>;

export const bulkIdsSchema = z.object({ ids: z.array(zUuid).min(1).max(100) });
