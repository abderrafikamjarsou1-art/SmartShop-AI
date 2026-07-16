"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, PlusCircle, Store } from "lucide-react";
import { useShell } from "@/components/layout/app-shell";
import { switchBusiness } from "@/actions/business";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

/**
 * Multi-shop switcher. Selection is persisted server-side (httpOnly cookie
 * set by switchBusiness), so it survives devices and can't be tampered
 * into another tenant — membership is re-verified on the server.
 */
export function BusinessSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { businesses, activeBusinessId } = useShell();
  const [pending, startTransition] = useTransition();
  const active = businesses.find((b) => b.id === activeBusinessId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={pending}
          aria-label="Switch business"
          className={`w-full justify-between shadow-soft ${collapsed ? "px-2" : ""}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Store className="size-4 shrink-0 text-primary" aria-hidden />
            {!collapsed && <span className="truncate text-sm">{active?.name ?? "Select"}</span>}
          </span>
          {!collapsed && <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {businesses.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={() => {
              if (b.id !== activeBusinessId) startTransition(() => switchBusiness(b.id));
            }}
          >
            <span className="flex-1 truncate">{b.name}</span>
            {b.id === activeBusinessId && <Check className="size-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <PlusCircle className="size-4" aria-hidden />
            New business
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
