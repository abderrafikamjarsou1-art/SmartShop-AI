import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { movementFilterSchema } from "@/lib/validation/inventory";
import { inventoryService } from "@/services/inventory-service";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import { MovementsToolbar } from "@/components/inventory/movements-toolbar";
import { MovementsTable } from "@/components/inventory/movements-table";
import { ImportDialog } from "@/components/inventory/import-dialog";
import { ExportMenu } from "@/components/inventory/export-menu";

export const metadata = { title: "Inventory movements" };

/** Movements ledger — same URL-is-state pattern as Products. */
export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireBusiness();
  const filter = movementFilterSchema.parse(await searchParams);

  const [{ items, total, page, totalPages }, options] = await Promise.all([
    inventoryService.listMovements(ctx, filter),
    inventoryService.getLedgerFilterOptions(ctx),
  ]);

  const canManage = hasPermission(ctx.role, "inventory:manage");

  return (
    <>
      <PageHeader
        title="Movements"
        description={`${total} ledger entr${total === 1 ? "y" : "ies"} — every stock change, explained.`}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu />
            {canManage && <ImportDialog />}
          </div>
        }
      />
      <InventoryTabs />

      <MovementsToolbar products={options.products} users={options.users} suppliers={options.suppliers} />

      <MovementsTable
        movements={items.map((m) => ({
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          quantityBefore: m.quantityBefore,
          quantityAfter: m.quantityAfter,
          reason: m.reason,
          saleId: m.saleId,
          purchaseId: m.purchaseId,
          createdAt: m.createdAt.toISOString(),
          product: m.product,
          user: m.user ? { name: m.user.fullName ?? m.user.email } : null,
        }))}
      />

      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
