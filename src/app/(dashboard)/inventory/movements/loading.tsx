import { TableSkeleton } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";

export default function MovementsLoading() {
  return (
    <>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-6 h-9 w-48 rounded-lg" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-36" />)}
      </div>
      <TableSkeleton rows={10} />
    </>
  );
}
