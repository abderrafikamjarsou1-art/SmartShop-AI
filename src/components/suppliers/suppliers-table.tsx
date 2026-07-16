"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSupplier, restoreSupplier } from "@/actions/contacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page-primitives";
import { SearchInput, DeleteDialog } from "@/components/shared/interactive";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface SupplierRow {
  id: string; name: string; contactPerson: string | null;
  phone: string | null; email: string | null;
  productCount: number; poCount: number; createdAt: string;
}

export function SuppliersTable({ suppliers, trashView }: { suppliers: SupplierRow[]; trashView: boolean }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<SupplierRow | null>(null);
  const [, start] = useTransition();

  if (suppliers.length === 0) {
    return <EmptyState title={trashView ? "Trash is empty" : "No suppliers yet"}
      description={trashView ? "Deleted suppliers can be restored from here." : "Add suppliers to create purchase orders and track costs."} />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead><TableHead>Contact</TableHead>
              <TableHead>Products</TableHead><TableHead>Orders</TableHead>
              <TableHead>Since</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => !trashView && router.push(`/suppliers/${s.id}`)}>
                <TableCell>
                  <p className="font-medium">{s.name}</p>
                  {s.contactPerson && <p className="text-xs text-muted-foreground">{s.contactPerson}</p>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell><Badge variant="secondary" className="tabular">{s.productCount}</Badge></TableCell>
                <TableCell><Badge variant="secondary" className="tabular">{s.poCount}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {trashView ? (
                    <Button variant="ghost" size="icon" aria-label={`Restore ${s.name}`}
                      onClick={() => start(async () => {
                        const r = await restoreSupplier(s.id);
                        r.success ? toast.success("Supplier restored.") : toast.error(r.error);
                      })}>
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        resourceName={deleteTarget?.name ?? "supplier"}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const r = await deleteSupplier(deleteTarget.id);
          r.success ? toast.success("Supplier moved to trash.") : toast.error(r.error);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

export function SuppliersToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trashView = searchParams.get("deleted") === "true";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key); else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Name, contact, phone or email…" />
      <Button variant={trashView ? "secondary" : "ghost"} size="sm" className="ml-auto"
        onClick={() => setParam("deleted", trashView ? "all" : "true")}>
        <Trash2 className="size-4" aria-hidden /> {trashView ? "Back to suppliers" : "Trash"}
      </Button>
    </div>
  );
}
