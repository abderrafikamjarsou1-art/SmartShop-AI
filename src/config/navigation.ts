import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Truck, Users,
  Factory, Receipt, BarChart3, FileText, Sparkles, Settings, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

/**
 * Single source of truth for app navigation.
 * Each item declares the permission it needs; the sidebar filters by the
 * current role's permission set — RBAC and menus can never drift apart.
 * `null` permission = visible to every authenticated member.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission | null;
  superAdminOnly?: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: null },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Products", href: "/products", icon: Package, permission: "products:view" },
      { title: "Inventory", href: "/inventory", icon: Boxes, permission: "inventory:view" },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Sales", href: "/sales", icon: ShoppingCart, permission: "sales:create" },
      { title: "Purchases", href: "/purchases", icon: Truck, permission: "purchases:manage" },
      { title: "Customers", href: "/customers", icon: Users, permission: "customers:manage" },
      { title: "Suppliers", href: "/suppliers", icon: Factory, permission: "suppliers:manage" },
      { title: "Expenses", href: "/expenses", icon: Receipt, permission: "expenses:manage" },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports:view" },
      { title: "Invoices", href: "/invoices", icon: FileText, permission: "invoices:manage" },
      { title: "AI Assistant", href: "/ai", icon: Sparkles, permission: "ai:use" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Settings", href: "/settings", icon: Settings, permission: "settings:manage" },
      { title: "Admin", href: "/admin", icon: ShieldCheck, permission: null, superAdminOnly: true },
    ],
  },
];

/** Filter groups down to what this user may see. Empty groups disappear. */
export function filterNav(permissions: Permission[], isSuperAdmin: boolean): NavGroup[] {
  const set = new Set(permissions);
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      return item.permission === null || set.has(item.permission);
    }),
  })).filter((g) => g.items.length > 0);
}
