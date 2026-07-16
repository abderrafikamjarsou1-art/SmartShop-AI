"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy, client-only wrappers around the report charts (Recharts is heavy
 * and off the initial bundle — same pattern as the AI/inventory charts).
 */
const fallback = () => <Skeleton className="h-[280px] w-full rounded-xl" />;

export const LazyTrendChart = dynamic(
  () => import("./report-charts").then((m) => m.TrendChart),
  { ssr: false, loading: fallback }
);

export const LazyPaymentPie = dynamic(
  () => import("./report-charts").then((m) => m.PaymentPie),
  { ssr: false, loading: fallback }
);

export const LazyGrowthChart = dynamic(
  () => import("./report-charts").then((m) => m.GrowthChart),
  { ssr: false, loading: fallback }
);
