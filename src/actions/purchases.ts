"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zUuid } from "@/lib/validation";
import {
  createPurchaseSchema, updateDraftPurchaseSchema, receivePurchaseSchema,
  purchaseReturnSchema,
} from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";

/** Purchases actions — permission: purchases:manage (managers and up). */

const PATHS = ["/purchases", "/products", "/inventory", "/dashboard"];
const revalidateAll = () => PATHS.forEach((p) => revalidatePath(p));

export async function createPurchase(input: unknown): Promise<ActionResult<{ id: string; purchaseNumber: number }>> {
  return safeAction("purchases.create", async () => {
    const ctx = await requireRole("purchases:manage");
    const data = zParse(createPurchaseSchema, input);
    const purchase = await purchaseService.create(ctx, data);
    revalidatePath("/purchases");
    return { id: purchase.id, purchaseNumber: purchase.purchaseNumber };
  });
}

export async function updateDraftPurchase(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("purchases.updateDraft", async () => {
    const ctx = await requireRole("purchases:manage");
    const data = zParse(updateDraftPurchaseSchema, input);
    const purchase = await purchaseService.updateDraft(ctx, data);
    revalidatePath("/purchases");
    return { id: purchase.id };
  });
}

export async function sendPurchase(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("purchases.send", async () => {
    const ctx = await requireRole("purchases:manage");
    await purchaseService.send(ctx, zParse(zUuid, id));
    revalidatePath("/purchases");
    return { id };
  });
}

export async function cancelPurchase(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("purchases.cancel", async () => {
    const ctx = await requireRole("purchases:manage");
    await purchaseService.cancel(ctx, zParse(zUuid, id));
    revalidatePath("/purchases");
    return { id };
  });
}

export async function receivePurchase(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("purchases.receive", async () => {
    const ctx = await requireRole("inventory:manage"); // receiving is a warehouse act
    const data = zParse(receivePurchaseSchema, input);
    const purchase = await purchaseService.receive(ctx, data);
    revalidateAll();
    return { id: purchase.id };
  });
}

export async function returnPurchase(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("purchases.return", async () => {
    const ctx = await requireRole("purchases:manage");
    const data = zParse(purchaseReturnSchema, input);
    const purchase = await purchaseService.processReturn(ctx, data);
    revalidateAll();
    return { id: purchase.id };
  });
}

const importSchema = z.object({ supplierId: zUuid, csvText: z.string().min(1).max(2_000_000) });

export async function importPurchaseCsv(input: unknown): Promise<ActionResult<{
  id: string; purchaseNumber: number; imported: number;
  errors: { row: number; sku: string; error: string }[];
}>> {
  return safeAction("purchases.importCsv", async () => {
    const ctx = await requireRole("purchases:manage");
    const { supplierId, csvText } = zParse(importSchema, input);
    const { purchase, imported, errors } = await purchaseService.importCsvAsDraft(ctx, supplierId, csvText);
    revalidatePath("/purchases");
    return { id: purchase.id, purchaseNumber: purchase.purchaseNumber, imported, errors };
  });
}

/** Cost intelligence for the product drawer / purchase form. */
export async function getProductCostInfo(productId: string): Promise<ActionResult<{
  history: { unitCost: number; quantity: number; date: string; supplier: string; po: number }[];
  supplierPricing: { supplier: string; unitCost: number; date: string }[];
}>> {
  return safeAction("purchases.costInfo", async () => {
    const ctx = await requireRole("purchases:manage");
    const id = zParse(zUuid, productId);
    const [history, pricing] = await Promise.all([
      purchaseService.getCostHistory(ctx, id),
      purchaseService.getSupplierPricing(ctx, id),
    ]);
    return {
      history: history.map((h) => ({
        unitCost: Number(h.unitCost), quantity: h.quantity,
        date: h.purchase.createdAt.toISOString(),
        supplier: h.purchase.supplier?.name ?? "—", po: h.purchase.purchaseNumber,
      })),
      supplierPricing: pricing.map((p) => ({
        supplier: p.supplier, unitCost: p.unitCost, date: p.date.toISOString(),
      })),
    };
  });
}
