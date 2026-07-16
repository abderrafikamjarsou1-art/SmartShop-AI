"use client";

import Link from "next/link";
import { Bell, Search, Settings, LogOut, User } from "lucide-react";
import { useShell } from "@/components/layout/app-shell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/lib/utils";

/** Frosted glass topbar — the app's signature surface. Sticky, translucent. */
export function Topbar({ mobileNav }: { mobileNav: React.ReactNode }) {
  const { user, role, notifications, unreadCount } = useShell();

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 sm:px-6">
      <div className="lg:hidden">{mobileNav}</div>

      {/* Global search (visual for now; command palette lands with real data) */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Search products, sales, customers…"
          aria-label="Search"
          className="rounded-full border-transparent bg-secondary pl-9 focus-visible:bg-background"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              className="relative"
            >
              <Bell className="size-4.5" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-medium">Notifications</p>
              {unreadCount > 0 && <Badge variant="secondary">{unreadCount} new</Badge>}
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notifications.map((n) => {
                  const row = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-sm ${n.unread ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    </>
                  );
                  return (
                    <li key={n.id} className="border-b last:border-0 hover:bg-secondary/60">
                      {n.link ? (
                        <Link href={n.link} className="block px-4 py-3">{row}</Link>
                      ) : (
                        <div className="px-4 py-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>

        <ThemeToggle />

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-full pl-1.5" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-xs">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user.name.split(" ")[0]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs font-normal text-muted-foreground">{role.toLowerCase()}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile"><User className="size-4" /> Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings"><Settings className="size-4" /> Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
  onSelect={() => logout()}
  className="text-destructive focus:text-destructive"
>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
