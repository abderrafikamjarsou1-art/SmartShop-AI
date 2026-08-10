import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireRole } from "@/lib/tenant";
import { reportService } from "@/services/report-service";
import { expenseService } from "@/services/expense-service";
import { productService } from "@/services/product-service";
import { inventoryService } from "@/services/inventory-service";
import { reportExportSchema } from "@/lib/validation/expense";
import { toCsv } from "@/lib/csv";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/reports/export?report=...&format=csv|xlsx|pdf&preset=...
 * Every export re-runs the same service the screen used — the file and
 * the screen can never disagree.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("reports:view");
    const q = reportExportSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const period = reportService.resolve({ preset: q.preset, from: q.from, to: q.to });

    const { rows, title } = await buildRows(ctx, q.report, period);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${q.report}-${stamp}.${q.format}`;

    if (q.format === "csv") {
      return new NextResponse("\uFEFF" + toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (q.format === "xlsx") {
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
      const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // PDF: simple report table
    const pdf = await PDFDocument.create();
    let page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const gray = rgb(0.45, 0.45, 0.5);
    let y = 790;

    page.drawText(`${ctx.business.name} — ${title}`, { x: 50, y, size: 14, font: bold });
    y -= 14;
    page.drawText(period.label, { x: 50, y, size: 9, font, color: gray });
    y -= 24;

    const headers = rows.length ? Object.keys(rows[0]) : [];
    const colWidth = Math.min(120, 495 / Math.max(1, headers.length));
    headers.forEach((h, i) => page.drawText(String(h).slice(0, 16), { x: 50 + i * colWidth, y, size: 8, font: bold, color: gray }));
    y -= 14;
    for (const row of rows.slice(0, 400)) {
      headers.forEach((h, i) => {
        const v = row[h as keyof typeof row];
        const s =
  typeof v === "number"
    ? Number(v).toFixed(2)
    : String(v ?? "—");
        page.drawText(s.slice(0, 18), { x: 50 + i * colWidth, y, size: 8, font });
      });
      y -= 12;
      if (y < 50) { page = pdf.addPage([595, 842]); y = 790; }
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
      return NextResponse.json({ error: error.expose ? error.message : "Failed." }, { status: error.statusCode });
    }
    logger.error("Report export failed", { error });
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}

async function buildRows(ctx: Awaited<ReturnType<typeof requireRole>>, report: string, period: ReturnType<typeof reportService.resolve>) {
  switch (report) {
    case "financial-summary": {
      const { summary } = await reportService.getFinancialSummary(ctx, period);
      return {
        title: "Financial summary",
        rows: Object.entries(summary)
          .filter(([, v]) => typeof v === "number")
          .map(([metric, value]) => ({ metric, value: value as number })),
      };
    }
    case "top-products": return { title: "Top products", rows: await reportService.getTopProducts(ctx, period, 100) };
    case "top-customers": return { title: "Top customers", rows: await reportService.getTopCustomers(ctx, period, 100) };
    case "sales-by-employee": return { title: "Sales by employee", rows: await reportService.getSalesByEmployee(ctx, period) };
    case "payment-methods": return { title: "Payment methods", rows: await reportService.getSalesByPaymentMethod(ctx, period) };
    case "refunds": return { title: "Refund report", rows: await reportService.getRefundReport(ctx, period) };
    case "purchases": return { title: "Purchase report", rows: await reportService.getPurchaseReport(ctx, period) };
    case "expenses": {
      const { items } = await expenseService.list(ctx, {
        page: 1, perPage: 100, deleted: false, recurring: false,
        from: period.from, to: new Date(period.to.getTime() - 1),
      });
      return {
        title: "Expenses",
        rows: items.map((e) => ({
          date: e.date.toISOString().slice(0, 10), title: e.title, category: e.category,
          vendor: e.supplier?.name ?? "", amount: Number(e.amount), tax: Number(e.taxAmount),
          method: e.paymentMethod ?? "",
        })),
      };
    }
    // Point-in-time reports (not period-scoped — current stock state, same
    // as the web Inventory tab's own numbers): reuse productService/
    // inventoryService as-is, no new aggregation logic.
    case "low-stock": {
      const { items } = await productService.list(ctx, {
        page: 1, perPage: 500, stock: "low", deleted: false, sortBy: "quantity", sortDir: "asc",
      });
      return {
        title: "Low stock",
        rows: items.map((p) => ({
          name: p.name, sku: p.sku ?? "", category: p.category?.name ?? "",
          quantity: p.quantity, minimumStock: p.minimumStock,
        })),
      };
    }
    case "inventory-valuation":
      return { title: "Inventory valuation", rows: await inventoryService.getExportRows(ctx, "stock") };
    default: return { title: report, rows: [] };
  }
}
