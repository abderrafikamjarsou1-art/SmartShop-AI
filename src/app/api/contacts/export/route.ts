import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { requireRole } from "@/lib/tenant";
import { customerService } from "@/services/customer-service";
import { supplierService } from "@/services/supplier-service";
import { toCsv } from "@/lib/csv";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  type: z.enum(["customers", "suppliers"]),
  format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
});

/** GET /api/contacts/export?type=customers|suppliers&format=csv|xlsx|pdf */
export async function GET(request: NextRequest) {
  try {
    const { type, format } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const ctx = await requireRole(type === "customers" ? "customers:manage" : "suppliers:manage");

    const rows = type === "customers"
      ? await customerService.getExportRows(ctx)
      : await supplierService.getExportRows(ctx);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${type}-${stamp}.${format}`;

    if (format === "csv") {
      return new NextResponse("\uFEFF" + toCsv(rows as Record<string, unknown>[]), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (format === "xlsx") {
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, type);
      const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // PDF: compact directory listing
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const gray = rgb(0.45, 0.45, 0.5);
    let page = pdf.addPage([595, 842]);
    let y = 800;

    page.drawText(`${ctx.business.name} — ${type === "customers" ? "Customers" : "Suppliers"}`, { x: 50, y, size: 14, font: bold });
    y -= 14;
    page.drawText(`${rows.length} record(s) · ${stamp}`, { x: 50, y, size: 9, font, color: gray });
    y -= 24;

    for (const row of rows as Record<string, unknown>[]) {
      page.drawText(String(row.name).slice(0, 45), { x: 50, y, size: 10, font: bold });
      const contactLine = [row.phone, row.email].filter(Boolean).join(" · ");
      if (contactLine) page.drawText(contactLine.slice(0, 60), { x: 300, y, size: 9, font, color: gray });
      y -= 15;
      if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
    }

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Export failed." }, { status: error.statusCode });
    }
    logger.error("Contacts export failed", { error });
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
