"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/shared/interactive";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Option { id: string; name: string }

const TYPES = [
  { value: "PURCHASE", label: "Purchase" },
  { value: "SALE", label: "Sale" },
  { value: "RETURN", label: "Return" },
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "INITIAL", label: "Opening stock" },
];

/** Ledger filters: product, type, user, supplier, date range, search — all URL params. */
export function MovementsToolbar({ products, users, suppliers }: {
  products: Option[]; users: Option[]; suppliers: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all" || value === "") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const selectFilter = (key: string, placeholder: string, options: Option[], width = "w-40") => (
    <Select value={searchParams.get(key) ?? "all"} onValueChange={(v) => setParam(key, v)}>
      <SelectTrigger className={width} aria-label={placeholder}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <SearchInput placeholder="Search product, SKU, reason…" />

      {selectFilter("productId", "All products", products)}

      <Select value={searchParams.get("type") ?? "all"} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-36" aria-label="Movement type"><SelectValue placeholder="All types" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {selectFilter("userId", "All members", users, "w-36")}
      {selectFilter("supplierId", "All suppliers", suppliers, "w-36")}

      <div className="flex items-end gap-2">
        <div>
          <Label htmlFor="from" className="mb-1 block text-xs text-muted-foreground">From</Label>
          <Input id="from" type="date" className="w-36"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="to" className="mb-1 block text-xs text-muted-foreground">To</Label>
          <Input id="to" type="date" className="w-36"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
