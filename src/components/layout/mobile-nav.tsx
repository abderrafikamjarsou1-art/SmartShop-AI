"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Store } from "lucide-react";
import { filterNav } from "@/config/navigation";
import { useShell } from "@/components/layout/app-shell";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Mobile navigation: full-height sheet, 44px touch targets,
 * closes on navigation.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { user, permissions } = useShell();
  const pathname = usePathname();
  const groups = filterNav(permissions, user.isSuperAdmin);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" aria-hidden />
            </span>
            SmartShop
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 py-3">
          <BusinessSwitcher />
        </div>
        <nav aria-label="Main navigation" className="overflow-y-auto px-3 pb-8">
          {groups.map((group, gi) => (
            <div key={gi} className="mb-2">
              {group.label && (
                <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm
                          ${active ? "bg-accent font-medium text-accent-foreground" : "hover:bg-secondary"}`}
                      >
                        <item.icon className="size-4.5" aria-hidden />
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
