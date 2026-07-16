"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/page-primitives";
import { SearchInput } from "@/components/shared/interactive";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export interface PurchaseRow {
  id: string; purchaseNumber: number; supplier: string;
  lineCount: number; ordered: number; received: number;
  total: number; status: string; createdAt: string;
}

const TONE: Record<string, string> = {
  DRAFT: "text-muted-foreground", ORDERED: "text-primary",
  PARTIALLY_RECEIVED: "text-warning", RECEIVED: "text-success", CANCELLED: "text-destructive",
};

export function PurchasesTable({ purchases, currency }: { purchases: PurchaseRow[]; currency: string }) {
  const router = useRouter();

  if (purchases.length === 0) {
    return <EmptyState title="No purchase orders" description="Create a purchase order to restock from your suppliers." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>PO</TableHead><TableHead>Supplier</TableHead><TableHead>Lines</TableHead>
            <TableHead>Received</TableHead><TableHead>Total</TableHead>
            <TableHead>Status</TableHead><TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.map((p) => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/purchases/${p.id}`)}>
              <TableCell className="font-medium">PO-{String(p.purchaseNumber).padStart(5, "0")}</TableCell>
              <TableCell>{p.supplier}</TableCell>
              <TableCell className="tabular">{p.lineCount}</TableCell>
              <TableCell className="tabular">
                <span className={p.received >= p.ordered ? "text-success" : p.received > 0 ? "text-warning" : "text-muted-foreground"}>
                  {p.received} / {p.ordered}
                </span>
              </TableCell>
              <TableCell className="tabular font-semibold">{formatMoney(p.total, currency)}</TableCell>
              <TableCell><Badge variant="secondary" className={TONE[p.status]}>{p.status.replace("_", " ").toLowerCase()}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PurchasesToolbar({ suppliers }: { suppliers: { id: string; name: string }[] }) {
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
      <SearchInput placeholder="PO # or supplier…" />
      <Select value={searchParams.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-44" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="ORDERED">Ordered</SelectItem>
          <SelectItem value="PARTIALLY_RECEIVED">Partially received</SelectItem>
          <SelectItem value="RECEIVED">Received</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Select value={searchParams.get("supplierId") ?? "all"} onValueChange={(v) => setParam("supplierId", v)}>
        <SelectTrigger className="w-40" aria-label="Filter by supplier"><SelectValue placeholder="Supplier" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All suppliers</SelectItem>
          {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
