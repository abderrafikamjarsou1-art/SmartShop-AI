import { StatCardSkeleton } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return (
    <>
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-64" />
      <Skeleton className="mb-6 h-9 w-48 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Skeleton className="h-[320px] rounded-xl xl:col-span-3" />
        <Skeleton className="h-[320px] rounded-xl xl:col-span-2" />
      </div>
    </>
  );
}
