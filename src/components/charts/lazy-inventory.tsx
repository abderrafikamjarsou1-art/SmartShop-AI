"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const LazyInventoryTrendChart = dynamic(
  () => import("@/components/charts/inventory-charts").then((m) => m.InventoryTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] w-full rounded-lg" /> }
);
