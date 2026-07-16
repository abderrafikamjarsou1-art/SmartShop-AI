import { UserRole } from "@prisma/client";

/**
 * RBAC — single source of truth for what each role can do.
 *
 * Design: a role -> permission-set map instead of scattered if/else.
 * Adding a permission = one line in PERMISSIONS + one line per role.
 * (SOLID: open for extension, closed for modification.)
 *
 * Role hierarchy:
 *  OWNER    — everything, including billing and deleting the business
 *  ADMIN    — everything except billing / business deletion
 *  MANAGER  — operations: products, inventory, purchases, expenses, reports
 *  CASHIER  — point of sale: create sales, manage customers, read products
 *  EMPLOYEE — read-only access to products and inventory
 */

export const PERMISSIONS = [
  "products:manage",
  "products:view",
  "inventory:manage",
  "inventory:view",
  "sales:create",
  "sales:manage",   // returns, cancellations, edits
  "customers:manage",
  "suppliers:manage",
  "purchases:manage",
  "expenses:manage",
  "reports:view",
  "invoices:manage",
  "ai:use",
  "users:manage",   // invite/remove members, change roles
  "settings:manage",
  "billing:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL),
  ADMIN: new Set(ALL.filter((p) => p !== "billing:manage")),
  MANAGER: new Set([
    "products:manage", "products:view",
    "inventory:manage", "inventory:view",
    "sales:create", "sales:manage",
    "customers:manage", "suppliers:manage",
    "purchases:manage", "expenses:manage",
    "reports:view", "invoices:manage", "ai:use",
  ]),
  CASHIER: new Set([
    "products:view", "inventory:view",
    "sales:create", "customers:manage", "invoices:manage",
  ]),
  EMPLOYEE: new Set(["products:view", "inventory:view"]),
};

/** Core check — everything else derives from this. */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

// ----------------------------------------------------
// Named helpers (readable call sites, per requirements)
// ----------------------------------------------------

export const canManageProducts = (r: UserRole) => hasPermission(r, "products:manage");
export const canManageInventory = (r: UserRole) => hasPermission(r, "inventory:manage");
export const canCreateSales = (r: UserRole) => hasPermission(r, "sales:create");
export const canManageSales = (r: UserRole) => hasPermission(r, "sales:manage");
export const canManageCustomers = (r: UserRole) => hasPermission(r, "customers:manage");
export const canManageSuppliers = (r: UserRole) => hasPermission(r, "suppliers:manage");
export const canManagePurchases = (r: UserRole) => hasPermission(r, "purchases:manage");
export const canManageExpenses = (r: UserRole) => hasPermission(r, "expenses:manage");
export const canViewReports = (r: UserRole) => hasPermission(r, "reports:view");
export const canUseAI = (r: UserRole) => hasPermission(r, "ai:use");
export const canManageUsers = (r: UserRole) => hasPermission(r, "users:manage");
export const canManageSettings = (r: UserRole) => hasPermission(r, "settings:manage");
export const canManageBilling = (r: UserRole) => hasPermission(r, "billing:manage");

/** For the sidebar: returns every permission a role has (drives menu visibility). */
export function getPermissions(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
