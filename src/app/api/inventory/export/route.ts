import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/tenant";
import { exportQuerySchema } from "@/lib/validation/inventory";
import { inventoryService } from "@/services/inventory-service";
import { toCsv } from "@/lib/csv";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/inventory/export?format=csv|xlsx&type=stock|movements
 * Route handler (not a server action) because the response is a file
 * download with proper Content-Disposition — the browser handles it
 * natively via a plain <a href>.
 * Same security pipeline as actions: requireRole -> zod -> service.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("inventory:view");
    const { format, type } = exportQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const rows = await inventoryService.getExportRows(ctx, type);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${type}-${stamp}.${format}`;

    if (format === "csv") {
      return new NextResponse("\uFEFF" + toCsv(rows), { // BOM -> Excel opens UTF-8 correctly
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // XLSX via SheetJS
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, type === "stock" ? "Stock" : "Movements");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Export failed." }, { status: error.statusCode });
    }
    logger.error("Inventory export failed", { error });
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
