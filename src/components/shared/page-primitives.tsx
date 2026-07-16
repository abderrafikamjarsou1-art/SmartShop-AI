import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/* =====================================================
   Design-system building blocks (Server Components —
   zero client JS unless a page needs interactivity).
   ===================================================== */

// ---------- Page header ----------
export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="display-tight text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Section header ----------
export function SectionHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="display-tight text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

// ---------- Stat card ----------
export function StatCard({
  label, value, delta, icon: Icon, hint,
}: {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="shadow-soft transition-shadow hover:shadow-lifted">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p data-slot="stat-value" className="display-tight mt-2 text-2xl font-semibold sm:text-[28px]">
          {value}
        </p>
        {(delta || hint) && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            {delta && (
              <span className={`flex items-center gap-0.5 font-medium ${delta.positive ? "text-success" : "text-destructive"}`}>
                {delta.positive
                  ? <ArrowUpRight className="size-3.5" aria-hidden />
                  : <ArrowDownRight className="size-3.5" aria-hidden />}
                {delta.value}
              </span>
            )}
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Empty state ----------
export function EmptyState({
  icon: Icon = Inbox, title, description, action,
}: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------- Error state ----------
export function ErrorState({
  title = "Something went wrong",
  description = "The data could not be loaded. Try again.",
  onRetry,
}: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-16 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

// ---------- Loading states / skeletons ----------
export function StatCardSkeleton() {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-2 h-3 w-20" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
