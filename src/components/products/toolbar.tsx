"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { SearchInput } from "@/components/shared/interactive";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Option { id: string; name: string }

/**
 * Filter bar. Every control writes to the URL (single source of truth);
 * the Server Component re-queries with the validated params.
 * "all" sentinel = remove the param (shadcn Select can't have empty values).
 */
export function ProductsToolbar({ categories, suppliers }: { categories: Option[]; suppliers: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trashView = searchParams.get("deleted") === "true";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Search name, SKU, barcode…" />

      <Select value={searchParams.get("categoryId") ?? "all"} onValueChange={(v) => setParam("categoryId", v)}>
        <SelectTrigger className="w-36" aria-label="Filter by category"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("supplierId") ?? "all"} onValueChange={(v) => setParam("supplierId", v)}>
        <SelectTrigger className="w-36" aria-label="Filter by supplier"><SelectValue placeholder="Supplier" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All suppliers</SelectItem>
          {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-32" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
          <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
        </SelectContent>
      </Select>

      <Select value={searchParams.get("stock") ?? "all"} onValueChange={(v) => setParam("stock", v)}>
        <SelectTrigger className="w-32" aria-label="Filter by stock"><SelectValue placeholder="Stock" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any stock</SelectItem>
          <SelectItem value="in">In stock</SelectItem>
          <SelectItem value="low">Low stock</SelectItem>
          <SelectItem value="out">Out of stock</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={trashView ? "secondary" : "ghost"}
        size="sm"
        className="ml-auto"
        onClick={() => setParam("deleted", trashView ? "all" : "true")}
      >
        {trashView
          ? <><Undo2 className="size-4" aria-hidden /> Back to products</>
          : <><Trash2 className="size-4" aria-hidden /> Trash</>}
      </Button>
    </div>
  );
}
