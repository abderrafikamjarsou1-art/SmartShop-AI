"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy chart entrypoints. next/dynamic with ssr:false keeps Recharts out
 * of the server bundle and the initial JS payload; the skeleton holds
 * the exact height so there's no layout shift when the chart mounts.
 */

const ChartFallback = () => <Skeleton className="h-[280px] w-full rounded-lg" />;

export const LazyRevenueChart = dynamic(
  () => import("@/components/charts/dashboard-charts").then((m) => m.RevenueChart),
  { ssr: false, loading: ChartFallback }
);

export const LazyWeeklySalesChart = dynamic(
  () => import("@/components/charts/dashboard-charts").then((m) => m.WeeklySalesChart),
  { ssr: false, loading: ChartFallback }
);
