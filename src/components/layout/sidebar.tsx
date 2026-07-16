"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeft, LogOut, Store } from "lucide-react";
import { filterNav } from "@/config/navigation";
import { useShell } from "@/components/layout/app-shell";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, permissions } = useShell();
  const pathname = usePathname();
  const groups = filterNav(permissions, user.isSuperAdmin);

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      {/* Brand + collapse */}
      <div className={`flex h-16 items-center border-b border-border/60 px-3 ${collapsed ? "justify-center" : "justify-between pl-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold display-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" aria-hidden />
            </span>
            SmartShop
          </Link>
        )}
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      {/* Business switcher */}
      <div className="px-3 py-3">
        <BusinessSwitcher collapsed={collapsed} />
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-2">
            {group.label && !collapsed && (
              <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
                      ${collapsed ? "justify-center px-2" : ""}
                      ${active
                        ? "font-medium text-accent-foreground"
                        : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"}`}
                  >
                    {/* Shared layout pill glides between active items */}
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-lg bg-accent"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <item.icon className="relative z-10 size-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="relative z-10">{item.title}</span>}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.title}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* User section */}
      <div className="border-t border-border/60 p-3">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <Avatar className="size-8">
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <form action={logout}>
                <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
