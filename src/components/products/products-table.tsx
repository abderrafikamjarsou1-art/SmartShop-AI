"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, ImageIcon, MoreHorizontal, Pencil, RotateCcw, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteProducts, restoreProduct, permanentDeleteProduct, adjustProductStock } from "@/actions/products";
import type { ProductRow } from "@/app/(dashboard)/products/page";
import { formatMoney } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/page-primitives";
import { DeleteDialog, ConfirmDialog } from "@/components/shared/interactive";
import { ProductDrawerTrigger } from "@/components/products/product-drawer";

interface Option { id: string; name: string }

interface Props {
  products: ProductRow[];
  canManage: boolean;
  isSuperAdmin: boolean;
  trashView: boolean;
  currency: string;
  categories: Option[];
  suppliers: Option[];
}

export function ProductsTable({ products, canManage, isSuperAdmin, trashView, currency, categories, suppliers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ProductRow | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ProductRow | null>(null);
  const [editTarget, setEditTarget] = useState<ProductRow | null>(null);

  // Optimistic: deleted rows vanish immediately; server truth arrives on revalidate.
  const [optimisticProducts, hideRows] = useOptimistic(
    products,
    (state, hiddenIds: string[]) => state.filter((p) => !hiddenIds.includes(p.id))
  );

  // Server-side sorting: header click writes sortBy/sortDir to the URL.
  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const sortDir = searchParams.get("sortDir") ?? "desc";
  const toggleSort = (field: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sortBy", field);
    params.set("sortDir", sortBy === field && sortDir === "asc" ? "desc" : "asc");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const runDelete = (ids: string[]) => {
    startTransition(async () => {
      hideRows(ids);
      setRowSelection({});
      const result = await deleteProducts({ ids });
      if (result.success) toast.success(`Moved ${result.data.count} product${result.data.count > 1 ? "s" : ""} to trash.`);
      else toast.error(result.error); // revalidate restores the rows
    });
  };

  const columns = useMemo<ColumnDef<ProductRow>[]>(() => {
    const sortHeader = (label: string, field: string) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-medium text-muted-foreground" onClick={() => toggleSort(field)}>
        {label} <ArrowUpDown className="size-3" aria-hidden />
      </Button>
    );

    const cols: ColumnDef<ProductRow>[] = [
      ...(canManage ? [{
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all products on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={`Select ${row.original.name}`} onClick={(e) => e.stopPropagation()} />
        ),
        size: 32,
      } satisfies ColumnDef<ProductRow>] : []),
      {
        id: "image",
        header: "",
        cell: ({ row }) => row.original.images[0] ? (
          <Image src={row.original.images[0].url} alt="" width={40} height={40}
            className="size-10 rounded-lg border object-cover" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-lg border bg-secondary">
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
        ),
        size: 48,
      },
      {
        accessorKey: "name",
        header: () => sortHeader("Name", "name"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.sku ?? "—"}</p>
          </div>
        ),
      },
      { accessorKey: "barcode", header: "Barcode", cell: ({ getValue }) => <span className="tabular text-xs">{(getValue() as string) ?? "—"}</span> },
      { id: "category", header: "Category", cell: ({ row }) => row.original.category?.name ?? "—" },
      { id: "supplier", header: "Supplier", cell: ({ row }) => row.original.supplier?.name ?? "—" },
      {
        accessorKey: "buyingPrice",
        header: () => sortHeader("Cost", "buyingPrice"),
        cell: ({ getValue }) => <span className="tabular">{formatMoney(getValue() as number, currency)}</span>,
      },
      {
        accessorKey: "sellingPrice",
        header: () => sortHeader("Price", "sellingPrice"),
        cell: ({ getValue }) => <span className="tabular font-medium">{formatMoney(getValue() as number, currency)}</span>,
      },
      {
        accessorKey: "quantity",
        header: () => sortHeader("Stock", "quantity"),
        cell: ({ row }) => {
          const { quantity, minimumStock } = row.original;
          const tone = quantity === 0 ? "text-destructive" : quantity <= minimumStock ? "text-warning" : "";
          return <span className={`tabular font-medium ${tone}`}>{quantity}</span>;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const status = getValue() as ProductRow["status"];
          const map = {
            ACTIVE: { label: "Active", cls: "text-success" },
            INACTIVE: { label: "Inactive", cls: "text-muted-foreground" },
            DISCONTINUED: { label: "Discontinued", cls: "text-warning" },
          } as const;
          return <Badge variant="secondary" className={map[status].cls}>{map[status].label}</Badge>;
        },
      },
      {
        accessorKey: "createdAt",
        header: () => sortHeader("Created", "createdAt"),
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(getValue() as string).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const p = row.original;
          if (!canManage) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {trashView ? (
                  <>
                    <DropdownMenuItem onSelect={() => startTransition(async () => {
                      const r = await restoreProduct(p.id);
                      if (r.success) {
                        toast.success("Product restored.");
                      } else {
                        toast.error(r.error);
                      }
                    })}>
                      <RotateCcw className="size-4" /> Restore
                    </DropdownMenuItem>
                    {isSuperAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setPurgeTarget(p)}
                          className="text-destructive focus:text-destructive"
                         >
                          <XCircle className="size-4" />
                          Delete permanently
                        </DropdownMenuItem>
                          
                        
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => setEditTarget(p)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAdjustTarget(p)}>
                      <SlidersHorizontal className="size-4" /> Adjust stock
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
  onSelect={() => setDeleteTarget([p.id])}
  className="text-destructive focus:text-destructive"
>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 40,
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, isSuperAdmin, trashView, currency, sortBy, sortDir]);

  const table = useReactTable({
    data: optimisticProducts,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = Object.keys(rowSelection);

  if (optimisticProducts.length === 0) {
    return (
      <EmptyState
        title={trashView ? "Trash is empty" : "No products yet"}
        description={trashView ? "Deleted products appear here and can be restored." : "Add your first product to start tracking stock and sales."}
        action={canManage && !trashView && (
          <ProductDrawerTrigger categories={categories} suppliers={suppliers} label="Add product" />
        )}
      />
    );
  }

  return (
    <>
      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border bg-card px-4 py-2.5 shadow-soft">
          <p className="text-sm"><span className="font-medium">{selectedIds.length}</span> selected</p>
          <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selectedIds)}>
            <Trash2 className="size-3.5" aria-hidden /> Delete selected
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}
                className={canManage && !trashView ? "cursor-pointer" : undefined}
                onClick={canManage && !trashView ? () => setEditTarget(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Soft delete confirm */}
      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        resourceName={deleteTarget && deleteTarget.length > 1 ? `${deleteTarget.length} products` : "product"}
        onConfirm={() => { if (deleteTarget) runDelete(deleteTarget); setDeleteTarget(null); }}
      />

      {/* Permanent delete confirm (super admin) */}
      <ConfirmDialog
        open={purgeTarget !== null}
        onOpenChange={(o) => !o && setPurgeTarget(null)}
        title={`Permanently delete “${purgeTarget?.name}”?`}
        description="The product and its images will be removed forever. Products with sales history can't be purged."
        confirmLabel="Delete forever"
        destructive
        onConfirm={async () => {
          if (!purgeTarget) return;
          const r = await permanentDeleteProduct(purgeTarget.id);
          if (r.success) {
            toast.success("Product permanently deleted.");
          } else {
            toast.error(r.error);
          }
          setPurgeTarget(null);
        }}
      />

      {/* Stock adjustment */}
      <AdjustStockDialog product={adjustTarget} onClose={() => setAdjustTarget(null)} />

      {/* Edit drawer (controlled) */}
      {editTarget && (
        <ProductDrawerTrigger
          categories={categories}
          suppliers={suppliers}
          product={editTarget}
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}
    </>
  );
}

// ---------- Stock adjustment dialog ----------
function AdjustStockDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust stock — {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Current stock: <span className="tabular font-medium text-foreground">{product?.quantity}</span></p>
          <div className="space-y-2">
            <Label htmlFor="newQty">New quantity</Label>
            <Input id="newQty" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" placeholder="e.g. Stock count correction" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button disabled={pending || quantity === "" || !reason.trim()}
            onClick={() => startTransition(async () => {
              const r = await adjustProductStock({ id: product!.id, newQuantity: quantity, reason });
              if (r.success) { toast.success(`Stock updated to ${r.data.quantity}.`); onClose(); setQuantity(""); setReason(""); }
              else toast.error(r.error);
            })}>
            {pending ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
