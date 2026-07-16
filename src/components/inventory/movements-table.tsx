"use client";

import Link from "next/link";
import { ArrowRight, ShoppingCart, Truck, Undo2, SlidersHorizontal, PackagePlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/page-primitives";

export interface MovementRow {
  id: string;
  type: "PURCHASE" | "SALE" | "RETURN" | "ADJUSTMENT" | "INITIAL";
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  saleId: string | null;
  purchaseId: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null };
  user: { name: string } | null;
}

const TYPE_META = {
  PURCHASE: { label: "Purchase", icon: Truck, cls: "text-success" },
  SALE: { label: "Sale", icon: ShoppingCart, cls: "text-chart-2" },
  RETURN: { label: "Return", icon: Undo2, cls: "text-warning" },
  ADJUSTMENT: { label: "Adjustment", icon: SlidersHorizontal, cls: "text-muted-foreground" },
  INITIAL: { label: "Opening", icon: PackagePlus, cls: "text-primary" },
} as const;

/**
 * The ledger. Read-only by design — movements are never edited or
 * deleted (append-only), which is exactly what makes them trustworthy.
 */
export function MovementsTable({ movements }: { movements: MovementRow[] }) {
  if (movements.length === 0) {
    return (
      <EmptyState
        title="No movements match"
        description="Stock changes appear here automatically — sales, purchases, returns and manual adjustments."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => {
            const meta = TYPE_META[m.type];
            return (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString(undefined, {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </TableCell>
                <TableCell>
                  <p className="max-w-52 truncate font-medium">{m.product.name}</p>
                  <p className="text-xs text-muted-foreground">{m.product.sku ?? "—"}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`gap-1 ${meta.cls}`}>
                    <meta.icon className="size-3" aria-hidden /> {meta.label}
                  </Badge>
                </TableCell>
                <TableCell className={`tabular text-right font-semibold ${m.quantity > 0 ? "text-success" : "text-destructive"}`}>
                  {m.quantity > 0 ? "+" : ""}{m.quantity}
                </TableCell>
                <TableCell className="text-right">
                  <span className="tabular inline-flex items-center gap-1 text-sm">
                    <span className="text-muted-foreground">{m.quantityBefore}</span>
                    <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                    <span className="font-medium">{m.quantityAfter}</span>
                  </span>
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{m.reason ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {m.saleId ? (
                    <Link href={`/sales/${m.saleId}`} className="text-primary hover:underline">Sale ↗</Link>
                  ) : m.purchaseId ? (
                    <Link href={`/purchases/${m.purchaseId}`} className="text-primary hover:underline">Purchase ↗</Link>
                  ) : (
                    <span className="text-muted-foreground">Manual</span>
                  )}
                </TableCell>
                <TableCell className="max-w-36 truncate text-xs text-muted-foreground">
                  {m.user?.name ?? "system"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
