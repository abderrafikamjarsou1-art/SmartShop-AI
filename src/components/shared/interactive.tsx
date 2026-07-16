"use client";

import { useState, useTransition, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* =====================================================
   Interactive shared components (Client Components).
   ===================================================== */

// ---------- Confirm dialog (controlled, promise-friendly) ----------
export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = "Confirm", destructive = false, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await onConfirm();
                onOpenChange(false);
              });
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Delete dialog (thin, consistent wrapper) ----------
export function DeleteDialog({
  open, onOpenChange, resourceName, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${resourceName}?`}
      description="This can't be undone. Records already linked to sales are kept for your reports."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
    />
  );
}

// ---------- Search input (debounced, URL-driven) ----------
export function SearchInput({ placeholder = "Search…", param = "q" }: { placeholder?: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");

  // Debounce: write to the URL 300ms after typing stops.
  // Server Components re-render with the new searchParam — no client fetching.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set(param, value);
      else params.delete(param);
      params.delete("page"); // new search -> back to page 1
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-8"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------- Pagination (URL-driven) ----------
export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goTo = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between pt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
