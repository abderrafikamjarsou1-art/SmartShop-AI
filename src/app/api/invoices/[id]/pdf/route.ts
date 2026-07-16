import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { requireRole } from "@/lib/tenant";
import { saleService } from "@/services/sale-service";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/invoices/[id]/pdf  (id = SALE id; the invoice is 1:1)
 *
 * DESIGN DECISION: pdf-lib, not headless Chrome. Invoices are structured
 * documents — drawing them directly is deterministic, ~50ms, zero native
 * deps, and Vercel-friendly. The QR encodes a verification payload
 * (business, invoice number, total, date) that a future public
 * verification page can consume.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole("invoices:manage");
    const { id } = await params;
    const sale = await saleService.getById(ctx, id);
    if (!sale.invoice) return NextResponse.json({ error: "No invoice for this sale." }, { status: 404 });

    const money = (n: unknown) => `${Number(n).toFixed(2)} ${ctx.business.currency}`;
    const inv = `INV-${String(sale.invoice.invoiceNumber).padStart(5, "0")}`;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait, points
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.13, 0.13, 0.15);
    const gray = rgb(0.45, 0.45, 0.5);
    let y = 790;

    const text = (s: string, x: number, size = 10, f = font, color = ink) =>
      page.drawText(s, { x, y, size, font: f, color });

    // Header
    text(ctx.business.name, 50, 20, bold); y -= 16;
    if (ctx.business.address) { text(ctx.business.address, 50, 9, font, gray); y -= 12; }
    if (ctx.business.phone) { text(ctx.business.phone, 50, 9, font, gray); }
    y = 790;
    text(inv, 430, 16, bold); y -= 16;
    text(new Date(sale.invoice.issuedAt).toLocaleDateString(), 430, 10, font, gray); y -= 12;
    text(`Sale #${sale.saleNumber}`, 430, 10, font, gray);

    // Customer
    y = 720;
    text("BILL TO", 50, 8, bold, gray); y -= 14;
    text(sale.customer?.name ?? "Walk-in customer", 50, 11, bold); y -= 13;
    if (sale.customer?.phone) { text(sale.customer.phone, 50, 9, font, gray); y -= 12; }

    // Table header
    y = 650;
    page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.7, color: gray });
    text("ITEM", 50, 8, bold, gray);
    text("QTY", 330, 8, bold, gray);
    text("PRICE", 390, 8, bold, gray);
    text("TOTAL", 480, 8, bold, gray);
    y -= 8;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.7, color: gray });
    y -= 16;

    // Lines
    for (const item of sale.items) {
      const name = item.product.name.length > 48 ? item.product.name.slice(0, 47) + "…" : item.product.name;
      text(name, 50, 10);
      text(String(item.quantity), 330, 10);
      text(money(item.unitPrice), 390, 10);
      text(money(item.total), 480, 10);
      if (item.returnedQuantity > 0) {
        y -= 11;
        text(`↩ ${item.returnedQuantity} returned`, 50, 8, font, gray);
      }
      y -= 16;
      if (y < 180) { y = 780; pdf.addPage([595, 842]); } // simple overflow guard
    }

    // Totals
    y -= 8;
    page.drawLine({ start: { x: 330, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 0.7, color: gray });
    y -= 12;
    const totalLine = (label: string, value: string, strong = false) => {
      text(label, 390, strong ? 11 : 9, strong ? bold : font, strong ? ink : gray);
      text(value, 480, strong ? 11 : 9, strong ? bold : font);
      y -= strong ? 18 : 14;
    };
    totalLine("Subtotal", money(sale.subtotal));
    if (Number(sale.discountAmount) > 0) totalLine("Discount", `-${money(sale.discountAmount)}`);
    totalLine(`Tax (${Number(sale.taxRate)}%)`, money(sale.taxAmount));
    totalLine("TOTAL", money(sale.total), true);
    totalLine("Paid", money(sale.amountPaid));

    // QR code (verification payload)
    const qrData = await QRCode.toDataURL(JSON.stringify({
      b: ctx.business.name, i: inv, t: Number(sale.total), d: sale.invoice.issuedAt,
    }), { margin: 0, width: 96 });
    const qrImage = await pdf.embedPng(qrData);
    page.drawImage(qrImage, { x: 50, y: 60, width: 72, height: 72 });
    page.drawText("Scan to verify", { x: 50, y: 48, size: 7, font, color: gray });
    page.drawText("Thank you for your business!", { x: 400, y: 60, size: 9, font, color: gray });

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${inv}.pdf"`, // inline = view; browser can download/print
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.expose ? error.message : "Failed." }, { status: error.statusCode });
    }
    logger.error("Invoice PDF failed", { error });
    return NextResponse.json({ error: "Failed to generate invoice." }, { status: 500 });
  }
}
