"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/page-primitives";
import { SearchInput } from "@/components/shared/interactive";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export interface SaleRow {
  id: string; saleNumber: number; invoiceNumber: number | null;
  customer: string; cashier: string; itemCount: number;
  total: number; amountPaid: number;
  status: string; paymentStatus: string; createdAt: string;
}

const STATUS_TONE: Record<string, string> = {
  COMPLETED: "text-success", DRAFT: "text-muted-foreground",
  PARTIALLY_RETURNED: "text-warning", RETURNED: "text-warning",
  VOIDED: "text-destructive", CANCELLED: "text-muted-foreground",
};
const PAY_TONE: Record<string, string> = {
  PAID: "text-success", PARTIAL: "text-warning", PENDING: "text-muted-foreground", REFUNDED: "text-destructive",
};

export function SalesTable({ sales, currency }: { sales: SaleRow[]; currency: string; canManage: boolean }) {
  const router = useRouter();

  if (sales.length === 0) {
    return <EmptyState title="No sales found" description="Completed and draft sales appear here. Open the POS to make your first sale." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Sale</TableHead><TableHead>Invoice</TableHead><TableHead>Customer</TableHead>
            <TableHead>Cashier</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead>
            <TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((s) => (
            <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/sales/${s.id}`)}>
              <TableCell className="font-medium">#{s.saleNumber}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {s.invoiceNumber ? `INV-${String(s.invoiceNumber).padStart(5, "0")}` : "—"}
              </TableCell>
              <TableCell>{s.customer}</TableCell>
              <TableCell className="text-muted-foreground">{s.cashier}</TableCell>
              <TableCell className="tabular">{s.itemCount}</TableCell>
              <TableCell className="tabular font-semibold">{formatMoney(s.total, currency)}</TableCell>
              <TableCell><Badge variant="secondary" className={STATUS_TONE[s.status]}>{s.status.replace("_", " ").toLowerCase()}</Badge></TableCell>
              <TableCell><Badge variant="outline" className={PAY_TONE[s.paymentStatus]}>{s.paymentStatus.toLowerCase()}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SalesToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key); else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Sale # or customer…" />
      <Select value={searchParams.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="DRAFT">Drafts (suspended)</SelectItem>
          <SelectItem value="PARTIALLY_RETURNED">Partially returned</SelectItem>
          <SelectItem value="RETURNED">Returned</SelectItem>
          <SelectItem value="VOIDED">Voided</SelectItem>
        </SelectContent>
      </Select>
      <Select value={searchParams.get("paymentStatus") ?? "all"} onValueChange={(v) => setParam("paymentStatus", v)}>
        <SelectTrigger className="w-36" aria-label="Filter by payment"><SelectValue placeholder="Payment" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any payment</SelectItem>
          <SelectItem value="PAID">Paid</SelectItem>
          <SelectItem value="PARTIAL">Partial</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="REFUNDED">Refunded</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
