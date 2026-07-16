import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireRole } from "@/lib/tenant";
import { purchaseService } from "@/services/purchase-service";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/purchases/[id]/pdf — printable purchase order to send to
 * the supplier. Same pdf-lib approach as invoices: deterministic,
 * fast, zero native deps.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole("purchases:manage");
    const { id } = await params;
    const po = await purchaseService.getById(ctx, id);

    const money = (n: unknown) => `${Number(n).toFixed(2)} ${ctx.business.currency}`;
    const ref = `PO-${String(po.purchaseNumber).padStart(5, "0")}`;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.13, 0.13, 0.15);
    const gray = rgb(0.45, 0.45, 0.5);
    let y = 790;
    const text = (s: string, x: number, size = 10, f = font, c = ink) =>
      page.drawText(s, { x, y, size, font: f, color: c });

    // Header
    text("PURCHASE ORDER", 50, 18, bold); y -= 18;
    text(ref, 50, 11, font, gray);
    y = 790;
    text(ctx.business.name, 400, 12, bold); y -= 14;
    if (ctx.business.address) { text(ctx.business.address, 400, 9, font, gray); y -= 11; }
    if (ctx.business.phone) text(ctx.business.phone, 400, 9, font, gray);

    // Supplier + dates
    y = 720;
    text("SUPPLIER", 50, 8, bold, gray); y -= 14;
    text(po.supplier?.name ?? "—", 50, 11, bold); y -= 13;
    if (po.supplier?.email) { text(po.supplier.email, 50, 9, font, gray); y -= 11; }
    if (po.supplier?.phone) { text(po.supplier.phone, 50, 9, font, gray); }
    y = 720;
    text("DATES", 400, 8, bold, gray); y -= 14;
    text(`Ordered: ${po.sentAt ? new Date(po.sentAt).toLocaleDateString() : "—"}`, 400, 9); y -= 12;
    text(`Expected: ${po.expectedAt ? new Date(po.expectedAt).toLocaleDateString() : "—"}`, 400, 9);

    // Table
    y = 640;
    page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.7, color: gray });
    text("ITEM", 50, 8, bold, gray);
    text("SKU", 280, 8, bold, gray);
    text("QTY", 380, 8, bold, gray);
    text("UNIT COST", 430, 8, bold, gray);
    text("TOTAL", 500, 8, bold, gray);
    y -= 8;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.7, color: gray });
    y -= 16;

    for (const item of po.items) {
      const name = item.product.name.length > 40 ? item.product.name.slice(0, 39) + "…" : item.product.name;
      text(name, 50, 10);
      text(item.product.sku ?? "—", 280, 9, font, gray);
      text(String(item.quantity), 380, 10);
      text(money(item.unitCost), 430, 10);
      text(money(item.total), 500, 10);
      y -= 16;
      if (y < 140) { y = 780; pdf.addPage([595, 842]); }
    }

    y -= 8;
    page.drawLine({ start: { x: 380, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 0.7, color: gray });
    y -= 14;
    text("TOTAL", 430, 11, bold);
    text(money(po.total), 500, 11, bold);

    if (po.notes) {
      y -= 28;
      text("NOTES", 50, 8, bold, gray); y -= 12;
      text(po.notes.slice(0, 120), 50, 9, font, gray);
    }

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${ref}.pdf"`,
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Failed." }, { status: error.statusCode });
    }
    logger.error("PO PDF failed", { error });
    return NextResponse.json({ error: "Failed to generate purchase order." }, { status: 500 });
  }
}
