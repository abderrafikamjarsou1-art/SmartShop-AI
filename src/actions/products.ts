"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/tenant";
import { requireSuperAdmin } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse } from "@/lib/validation";
import {
  createProductSchema, updateProductSchema, adjustStockSchema, bulkIdsSchema,
} from "@/lib/validation/product";
import { productService } from "@/services/product-service";
import { NotFoundError } from "@/lib/errors";

/**
 * Product Server Actions — the ONLY bridge between UI and service.
 * Every action is exactly three lines of logic:
 *   1. requireRole(...)  — auth + tenant + RBAC in one call
 *   2. zParse(...)       — validate the untrusted input
 *   3. service call      — business logic, tenant-scoped
 * Then revalidate. This shape is the template for every module.
 */

const PATH = "/products";

export async function createProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("products.create", async () => {
    const ctx = await requireRole("products:manage");
    const data = zParse(createProductSchema, input);
    const product = await productService.create(ctx, data);
    revalidatePath(PATH);
    return { id: product.id };
  });
}

export async function updateProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("products.update", async () => {
    const ctx = await requireRole("products:manage");
    const data = zParse(updateProductSchema, input);
    const product = await productService.update(ctx, data);
    revalidatePath(PATH);
    return { id: product.id };
  });
}

export async function adjustProductStock(input: unknown): Promise<ActionResult<{ quantity: number }>> {
  return safeAction("products.adjustStock", async () => {
    const ctx = await requireRole("inventory:manage");
    const data = zParse(adjustStockSchema, input);
    const product = await productService.adjustStock(ctx, data);
    revalidatePath(PATH);
    revalidatePath("/inventory");
    return { quantity: product.quantity };
  });
}

export async function deleteProducts(input: unknown): Promise<ActionResult<{ count: number }>> {
  return safeAction("products.delete", async () => {
    const ctx = await requireRole("products:manage");
    const { ids } = zParse(bulkIdsSchema, input);
    const result = await productService.softDelete(ctx, ids);
    revalidatePath(PATH);
    return result;
  });
}

export async function restoreProduct(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("products.restore", async () => {
    const ctx = await requireRole("products:manage");
    await productService.restore(ctx, id);
    revalidatePath(PATH);
    return { id };
  });
}

/** Permanent delete — SUPER ADMIN only, on top of tenant membership. */
export async function permanentDeleteProduct(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("products.permanentDelete", async () => {
    await requireSuperAdmin();
    const ctx = await getCurrentBusiness();
    if (!ctx) throw new NotFoundError("Business");
    await productService.permanentDelete(ctx, id);
    revalidatePath(PATH);
    return { id };
  });
}
