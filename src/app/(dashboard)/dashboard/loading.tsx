import { StatCardSkeleton } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level Suspense boundary: Next.js streams this instantly while
 * the Server Component fetches. Mirrors the real layout -> no layout shift.
 */
export default function DashboardLoading() {
  return (
    <>
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Skeleton className="h-[360px] rounded-xl xl:col-span-3" />
        <Skeleton className="h-[360px] rounded-xl xl:col-span-2" />
      </div>
    </>
  );
}
