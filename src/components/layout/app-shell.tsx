"use client";

import { useState, useEffect, createContext, useContext } from "react";
import type { UserRole } from "@prisma/client";
import type { Permission } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
}
export interface ShellBusiness {
  id: string;
  name: string;
  logoUrl: string | null;
}
export interface ShellNotification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  createdAt: string; // ISO — serialization-safe across the RSC boundary
  unread: boolean;
}
interface ShellProps {
  user: ShellUser;
  businesses: ShellBusiness[];
  activeBusinessId: string;
  role: UserRole;
  permissions: Permission[];
  notifications: ShellNotification[];
  unreadCount: number;
  children: React.ReactNode;
}

const ShellContext = createContext<Omit<ShellProps, "children"> | null>(null);
export const useShell = () => {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
};

const COLLAPSE_KEY = "ssai-sidebar-collapsed";

/**
 * The app frame. Desktop: fixed sidebar (collapsible, persisted) + glass
 * topbar. Mobile: sheet navigation + comfortable bottom padding so content
 * never hides behind the thumb zone.
 */
export function AppShell({ children, ...shell }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    setHydrated(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  };

  return (
    <ShellContext.Provider value={shell}>
      <div className="min-h-dvh">
        {/* Desktop sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 hidden lg:block border-r border-border/60 bg-sidebar
            transition-[width] duration-300 ease-out ${collapsed ? "w-[72px]" : "w-64"}
            ${hydrated ? "" : "transition-none"}`}
        >
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>

        {/* Content column */}
        <div
          className={`flex min-h-dvh flex-col transition-[padding] duration-300 ease-out
            ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}
        >
          <Topbar mobileNav={<MobileNav />} />
          <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
