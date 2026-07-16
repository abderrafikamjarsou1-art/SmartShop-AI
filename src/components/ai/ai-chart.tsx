"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const LazyAiChart = dynamic(() => import("./ai-chart-inner").then((m) => m.AiChartInner), {
  ssr: false,
  loading: () => <Skeleton className="h-[220px] w-full rounded-lg" />,
});
