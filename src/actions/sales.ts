"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse } from "@/lib/validation";
import {
  createSaleSchema, updateDraftSchema, returnSchema, saleFilterSchema, posSearchSchema,
} from "@/lib/validation/sale";
import { saleService } from "@/services/sale-service";
import { z } from "zod";
import { zUuid, zRequiredString } from "@/lib/validation";

/**
 * Sales actions — same three-line template. RBAC split:
 *  sales:create -> POS operations (cashiers included)
 *  sales:manage -> voids, price overrides (managers and up)
 */

const PATHS = ["/sales", "/products", "/inventory", "/dashboard"];
const revalidateAll = () => PATHS.forEach((p) => revalidatePath(p));

export async function createSale(input: unknown): Promise<ActionResult<{ id: string; saleNumber: number; invoiceNumber: number | null }>> {
  return safeAction("sales.create", async () => {
    const ctx = await requireRole("sales:create");
    const data = zParse(createSaleSchema, input);
    const sale = await saleService.create(ctx, data);
    revalidateAll();
    return { id: sale.id, saleNumber: sale.saleNumber, invoiceNumber: sale.invoice?.invoiceNumber ?? null };
  });
}

export async function updateDraftSale(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("sales.updateDraft", async () => {
    const ctx = await requireRole("sales:create");
    const data = zParse(updateDraftSchema, input);
    const sale = await saleService.updateDraft(ctx, data);
    revalidatePath("/sales");
    return { id: sale.id };
  });
}

export async function cancelDraftSale(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("sales.cancelDraft", async () => {
    const ctx = await requireRole("sales:create");
    await saleService.cancelDraft(ctx, zParse(zUuid, id));
    revalidatePath("/sales");
    return { id };
  });
}

const voidSchema = z.object({ id: zUuid, reason: zRequiredString("Reason", 200) });

export async function voidSale(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("sales.void", async () => {
    const ctx = await requireRole("sales:manage"); // managers and up
    const { id, reason } = zParse(voidSchema, input);
    await saleService.voidSale(ctx, id, reason);
    revalidateAll();
    return { id };
  });
}

export async function processReturn(input: unknown): Promise<ActionResult<{ refund: number }>> {
  return safeAction("sales.return", async () => {
    const ctx = await requireRole("sales:manage");
    const data = zParse(returnSchema, input);
    const { refund } = await saleService.processReturn(ctx, data);
    revalidateAll();
    return { refund };
  });
}

/** POS live search (used on every keystroke after debounce). */
export async function searchPosProducts(input: unknown): Promise<ActionResult<{
  exact: boolean;
  products: { id: string; name: string; sku: string | null; barcode: string | null; sellingPrice: number; quantity: number; imageUrl: string | null }[];
}>> {
  return safeAction("sales.posSearch", async () => {
    const ctx = await requireRole("sales:create");
    const { q } = zParse(posSearchSchema, input);
    const result = await saleService.searchForPos(ctx, q);
    return {
      exact: result.exact,
      products: result.products.map((p) => ({
        id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
        sellingPrice: Number(p.sellingPrice), quantity: p.quantity,
        imageUrl: p.images[0]?.url ?? null,
      })),
    };
  });
}

/** Lightweight customer lookup for the POS customer selector. */
export async function searchCustomers(q: string): Promise<ActionResult<{ id: string; name: string; storeCredit: number; outstandingBalance: number }[]>> {
  return safeAction("sales.customerSearch", async () => {
    const ctx = await requireRole("sales:create");
    const query = z.string().trim().min(1).max(100).parse(q);
    const customers = await saleService.searchCustomers(ctx, query);
    return customers.map((c) => ({
      id: c.id, name: c.name,
      storeCredit: Number(c.storeCredit), outstandingBalance: Number(c.outstandingBalance),
    }));
  });
}
