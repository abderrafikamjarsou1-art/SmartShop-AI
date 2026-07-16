"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zUuid } from "@/lib/validation";
import {
  createCustomerSchema, updateCustomerSchema, recordPaymentSchema,
  createSupplierSchema, updateSupplierSchema,
} from "@/lib/validation/contact";
import { customerService } from "@/services/customer-service";
import { supplierService } from "@/services/supplier-service";

/** Contacts actions — customers:manage / suppliers:manage. */

const csvSchema = z.object({ csvText: z.string().min(1).max(2_000_000) });

// ============ CUSTOMERS ============

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("customers.create", async () => {
    const ctx = await requireRole("customers:manage");
    const customer = await customerService.create(ctx, zParse(createCustomerSchema, input));
    revalidatePath("/customers");
    return { id: customer.id };
  });
}

export async function updateCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("customers.update", async () => {
    const ctx = await requireRole("customers:manage");
    const customer = await customerService.update(ctx, zParse(updateCustomerSchema, input));
    revalidatePath("/customers");
    return { id: customer.id };
  });
}

export async function deleteCustomer(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("customers.delete", async () => {
    const ctx = await requireRole("customers:manage");
    await customerService.softDelete(ctx, zParse(zUuid, id));
    revalidatePath("/customers");
    return { id };
  });
}

export async function restoreCustomer(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("customers.restore", async () => {
    const ctx = await requireRole("customers:manage");
    await customerService.restore(ctx, zParse(zUuid, id));
    revalidatePath("/customers");
    return { id };
  });
}

export async function recordCustomerPayment(input: unknown): Promise<ActionResult<{
  allocations: { saleNumber: number; amount: number }[];
}>> {
  return safeAction("customers.recordPayment", async () => {
    const ctx = await requireRole("customers:manage");
    const { allocations } = await customerService.recordPayment(ctx, zParse(recordPaymentSchema, input));
    ["/customers", "/sales", "/dashboard"].forEach((p) => revalidatePath(p));
    return { allocations: allocations.map((a) => ({ saleNumber: a.saleNumber, amount: a.amount })) };
  });
}

export async function previewCustomerImport(input: unknown): Promise<ActionResult<
  { row: number; name: string; status: "ok" | "duplicate" | "error"; error?: string }[]
>> {
  return safeAction("customers.previewImport", async () => {
    const ctx = await requireRole("customers:manage");
    const { csvText } = zParse(csvSchema, input);
    return customerService.previewImport(ctx, csvText);
  });
}

export async function commitCustomerImport(input: unknown): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return safeAction("customers.commitImport", async () => {
    const ctx = await requireRole("customers:manage");
    const { csvText } = zParse(csvSchema, input);
    const result = await customerService.commitImport(ctx, csvText);
    revalidatePath("/customers");
    return result;
  });
}

// ============ SUPPLIERS ============

export async function createSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("suppliers.create", async () => {
    const ctx = await requireRole("suppliers:manage");
    const supplier = await supplierService.create(ctx, zParse(createSupplierSchema, input));
    revalidatePath("/suppliers");
    return { id: supplier.id };
  });
}

export async function updateSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  return safeAction("suppliers.update", async () => {
    const ctx = await requireRole("suppliers:manage");
    const supplier = await supplierService.update(ctx, zParse(updateSupplierSchema, input));
    revalidatePath("/suppliers");
    return { id: supplier.id };
  });
}

export async function deleteSupplier(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("suppliers.delete", async () => {
    const ctx = await requireRole("suppliers:manage");
    await supplierService.softDelete(ctx, zParse(zUuid, id));
    revalidatePath("/suppliers");
    return { id };
  });
}

export async function restoreSupplier(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("suppliers.restore", async () => {
    const ctx = await requireRole("suppliers:manage");
    await supplierService.restore(ctx, zParse(zUuid, id));
    revalidatePath("/suppliers");
    return { id };
  });
}

export async function previewSupplierImport(input: unknown): Promise<ActionResult<
  { row: number; name: string; status: "ok" | "duplicate" | "error"; error?: string }[]
>> {
  return safeAction("suppliers.previewImport", async () => {
    const ctx = await requireRole("suppliers:manage");
    const { csvText } = zParse(csvSchema, input);
    return supplierService.previewImport(ctx, csvText);
  });
}

export async function commitSupplierImport(input: unknown): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return safeAction("suppliers.commitImport", async () => {
    const ctx = await requireRole("suppliers:manage");
    const { csvText } = zParse(csvSchema, input);
    const result = await supplierService.commitImport(ctx, csvText);
    revalidatePath("/suppliers");
    return result;
  });
}
