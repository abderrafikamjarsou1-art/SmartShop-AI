"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TABS = [
  { key: "executive", label: "Executive" },
  { key: "sales", label: "Sales" },
  { key: "inventory", label: "Inventory" },
  { key: "financial", label: "Financial" },
] as const;

export function ReportTabs({ active }: { active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex rounded-xl border bg-card p-1 shadow-soft" role="tablist" aria-label="Report dashboards">
      {TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => go(t.key)}
          className={`rounded-lg px-4 py-1.5 text-sm transition-colors
            ${active === t.key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = searchParams.get("preset") ?? "monthly";

  const set = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k); else params.set(k, v);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={preset} onValueChange={(v) => set(v === "custom" ? { preset: v } : { preset: v, from: null, to: null })}>
        <SelectTrigger className="w-36" aria-label="Report period"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">Today</SelectItem>
          <SelectItem value="weekly">This week</SelectItem>
          <SelectItem value="monthly">This month</SelectItem>
          <SelectItem value="quarterly">This quarter</SelectItem>
          <SelectItem value="yearly">This year</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <Input type="date" className="w-36" aria-label="From"
            defaultValue={searchParams.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} />
          <Input type="date" className="w-36" aria-label="To"
            defaultValue={searchParams.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} />
        </>
      )}
    </div>
  );
}

const REPORTS = [
  ["financial-summary", "Financial summary"],
  ["top-products", "Top products"],
  ["top-customers", "Top customers"],
  ["sales-by-employee", "Sales by employee"],
  ["payment-methods", "Payment methods"],
  ["refunds", "Refunds"],
  ["purchases", "Purchases"],
  ["expenses", "Expenses"],
] as const;

export function ExportMenu({ preset, from, to }: { preset: string; from?: string; to?: string }) {
  const base = (report: string, format: string) => {
    const params = new URLSearchParams({ report, format, preset });
    if (from) params.set("from", from.slice(0, 10));
    if (to) params.set("to", to.slice(0, 10));
    return `/api/reports/export?${params.toString()}`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><Download className="size-4" aria-hidden /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {REPORTS.map(([key, label]) => (
          <div key={key}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
            <div className="flex gap-1 px-2 pb-1.5">
              {["csv", "xlsx", "pdf"].map((f) => (
                <DropdownMenuItem key={f} asChild className="flex-1 justify-center">
                  <a href={base(key, f)} download>{f.toUpperCase()}</a>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =====================================================
// Lazy charts (Recharts stays out of the initial bundle)
// =====================================================

const ChartFallback = () => <Skeleton className="h-[280px] w-full rounded-lg" />;

export const LazyTrendChart = dynamic(
  () => import("@/components/reports/report-charts").then((m) => m.TrendChart),
  { ssr: false, loading: ChartFallback }
);
export const LazyPaymentPie = dynamic(
  () => import("@/components/reports/report-charts").then((m) => m.PaymentPie),
  { ssr: false, loading: ChartFallback }
);
export const LazyGrowthChart = dynamic(
  () => import("@/components/reports/report-charts").then((m) => m.GrowthChart),
  { ssr: false, loading: ChartFallback }
);
