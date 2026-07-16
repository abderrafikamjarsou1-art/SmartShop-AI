"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse } from "@/lib/validation";
import { bulkAdjustSchema, importRowSchema, type BulkAdjustResult, type ImportRow } from "@/lib/validation/inventory";
import { csvToObjects } from "@/lib/csv";
import { inventoryService } from "@/services/inventory-service";
import { ValidationError } from "@/lib/errors";

/**
 * Inventory actions — same three-line template as Products.
 * CSV text is parsed AND validated on the server both at preview and at
 * commit time (never trust the client's "validated" rows).
 */

const REQUIRED_HEADERS = ["sku", "newquantity"] as const;

/** CSV text -> validated ImportRows + per-row errors. Shared by preview & commit. */
function parseAndValidateCsv(csv: string): { rows: ImportRow[]; rowErrors: { row: number; sku: string; error: string }[] } {
  const { headers, objects } = csvToObjects(csv);

  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new ValidationError(`Missing column(s): ${missing.join(", ")}. Expected header: sku,newQuantity,reason`);
  }

  const rows: ImportRow[] = [];
  const rowErrors: { row: number; sku: string; error: string }[] = [];
  objects.forEach((obj, i) => {
    const parsed = importRowSchema.safeParse({
      sku: obj["sku"],
      newQuantity: obj["newquantity"],
      reason: obj["reason"] || undefined,
    });
    if (parsed.success) rows.push(parsed.data);
    else rowErrors.push({ row: i + 1, sku: obj["sku"] ?? "?", error: parsed.error.issues[0].message });
  });
  return { rows, rowErrors };
}

const csvInputSchema = z.object({
  csv: z.string().min(1, "The file is empty.").max(2_000_000, "File too large (2 MB max)."),
  atomic: z.coerce.boolean().default(false),
});

export interface ImportPreview {
  valid: { row: number; sku: string; productName: string; from: number; to: number }[];
  errors: { row: number; sku: string; error: string }[];
  totalRows: number;
}

/** Step 1 of import: parse, validate, dry-run against the DB. No writes. */
export async function previewInventoryImport(input: unknown): Promise<ActionResult<ImportPreview>> {
  return safeAction("inventory.previewImport", async () => {
    const ctx = await requireRole("inventory:manage");
    const { csv } = zParse(csvInputSchema, input);
    const { rows, rowErrors } = parseAndValidateCsv(csv);
    const preview = await inventoryService.previewAdjust(ctx, rows);
    // Merge schema-level errors (bad quantity) with DB-level errors (unknown SKU)
    return {
      ...preview,
      errors: [...rowErrors, ...preview.errors].sort((a, b) => a.row - b.row),
      totalRows: preview.totalRows + rowErrors.length,
    };
  });
}

/** Step 2 of import: re-parse, re-validate, apply. Atomic flag = all-or-nothing. */
export async function commitInventoryImport(input: unknown): Promise<ActionResult<BulkAdjustResult>> {
  return safeAction("inventory.commitImport", async () => {
    const ctx = await requireRole("inventory:manage");
    const { csv, atomic } = zParse(csvInputSchema, input);
    const { rows, rowErrors } = parseAndValidateCsv(csv);

    if (atomic && rowErrors.length > 0) {
      throw new ValidationError(`Atomic import aborted: row ${rowErrors[0].row} — ${rowErrors[0].error}`);
    }
    const data = zParse(bulkAdjustSchema, { rows, atomic });
    const result = await inventoryService.bulkAdjust(ctx, data);

    revalidatePath("/inventory");
    revalidatePath("/products");
    // Schema-invalid rows were skipped before the service; report them too
    return { ...result, skipped: [...rowErrors, ...result.skipped].sort((a, b) => a.row - b.row) };
  });
}

/** Manual bulk adjustment (dialog rows — same pipeline, no CSV). */
export async function bulkAdjustStock(input: unknown): Promise<ActionResult<BulkAdjustResult>> {
  return safeAction("inventory.bulkAdjust", async () => {
    const ctx = await requireRole("inventory:manage");
    const data = zParse(bulkAdjustSchema, input);
    const result = await inventoryService.bulkAdjust(ctx, data);
    revalidatePath("/inventory");
    revalidatePath("/products");
    return result;
  });
}
