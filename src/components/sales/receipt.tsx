"use client";

import { CheckCircle2, Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Post-sale receipt dialog.
 * - Print Receipt: opens the invoice PDF in a hidden iframe-free way —
 *   we open the PDF route in a new tab; the browser's PDF viewer prints
 *   to receipt or A4 printers alike (Content-Disposition: inline).
 * - Download: same route, download attribute.
 * Change due is shown big — the number the cashier needs right now.
 */
export function ReceiptDialog({ saleNumber, invoiceNumber, saleId, change, currency, onClose }: {
  saleNumber: number; invoiceNumber: number | null; saleId: string; change: number; currency: string; onClose: () => void;
}) {
  const pdfUrl = `/api/invoices/${saleId}/pdf`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            Sale #{saleNumber} completed
          </DialogTitle>
        </DialogHeader>

        {change > 0 && (
          <div className="rounded-xl bg-accent p-4 text-center">
            <p className="text-sm text-accent-foreground">Change due</p>
            <p className="tabular display-tight text-3xl font-semibold text-accent-foreground">
              {change.toFixed(2)} {currency}
            </p>
          </div>
        )}

        {invoiceNumber !== null && (
          <p className="text-center text-sm text-muted-foreground">
            Invoice INV-{String(invoiceNumber).padStart(5, "0")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => window.open(pdfUrl, "_blank")}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
          <Button variant="outline" asChild>
            <a href={pdfUrl} download><FileDown className="size-4" aria-hidden /> Download</a>
          </Button>
        </div>

        <Button onClick={onClose} className="h-11">New sale</Button>
      </DialogContent>
    </Dialog>
  );
}
